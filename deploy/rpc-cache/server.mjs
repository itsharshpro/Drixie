import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3031);
const STRATEGY = process.env.RPC_STRATEGY === "ordered" ? "ordered" : "spread";
const TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS ?? 25_000);
const MAX_INFLIGHT = Number(process.env.RPC_MAX_INFLIGHT ?? 24);
const CHUNK_CACHE = 8_000;

function upstream(url, rps) {
  return { url, rps: rps > 0 ? rps : 5, tokens: 1, last: Date.now(), coolUntil: 0, ok: 0, errors: 0, strikes: 0, inflight: 0, ms: 0 };
}
const UPSTREAMS = (process.env.RPC_UPSTREAMS ?? "https://rpc.testnet.fastnear.com=8")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const i = s.lastIndexOf("=");
    return i > 0 ? upstream(s.slice(0, i), Number(s.slice(i + 1))) : upstream(s, 5);
  });
const NEARDATA = process.env.NEARDATA_URL ? upstream(process.env.NEARDATA_URL.replace(/\/+$/, ""), Number(process.env.NEARDATA_RPS ?? 1)) : null;

const stats = { strategy: STRATEGY, requests: 0, methods: {}, chunkHits: 0, chunkMisses: 0, prefetched: 0, neardataBlocks: 0, retries: 0, failures: 0, startedAt: new Date().toISOString() };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function refill(u, now) {
  u.tokens = Math.min(Math.max(1, u.rps), u.tokens + ((now - u.last) / 1000) * u.rps);
  u.last = now;
}
function cool(u, base) {
  u.errors++;
  u.strikes = Math.min(u.strikes + 1, 5);
  u.coolUntil = Date.now() + Math.min(30_000, base * 2 ** (u.strikes - 1));
}
function usable(u, now) {
  refill(u, now);
  return u.coolUntil <= now && u.inflight < MAX_INFLIGHT;
}

async function acquire(exclude) {
  for (;;) {
    const now = Date.now();
    let pick = null;
    const pool = UPSTREAMS.filter((u) => !exclude.has(u) || exclude.size >= UPSTREAMS.length);
    if (STRATEGY === "ordered") {

      pick = pool.find((u) => usable(u, now)) ?? null;
      if (!pick) pick = [...pool].sort((a, b) => a.coolUntil - b.coolUntil)[0] ?? null;
      if (pick && pick.coolUntil <= now && pick.tokens >= 1) {
        pick.tokens -= 1;
        return pick;
      }
    } else {
      for (const u of pool) {
        if (!usable(u, now)) continue;
        if (!pick || u.tokens / u.rps > pick.tokens / pick.rps) pick = u;
      }
      if (pick && pick.tokens >= 1) {
        pick.tokens -= 1;
        return pick;
      }
    }
    await sleep(20);
  }
}

const rateLimited = (status, text) => status === 429 || status >= 500 || /"code":\s*-429|Rate limits exceeded/.test(text.slice(0, 300));

async function forward(body) {
  const tried = new Set();
  let lastErr = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const u = await acquire(tried);
    tried.add(u);
    u.inflight++;
    const t0 = Date.now();
    try {
      const res = await fetch(u.url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const text = await res.text();
      if (rateLimited(res.status, text)) {
        cool(u, 2_000);
        lastErr = `${u.url} HTTP ${res.status}`;
        stats.retries++;
        continue;
      }
      u.ok++;
      u.ms += Date.now() - t0;
      if (u.ok % 20 === 0) u.strikes = 0;
      return { status: res.status, text };
    } catch (e) {
      cool(u, 3_000);
      lastErr = `${u.url} ${e instanceof Error ? e.message : String(e)}`;
      stats.retries++;
    } finally {
      u.inflight--;
    }
  }
  stats.failures++;
  throw new Error(lastErr ?? "no upstream answered");
}

const chunks = new Map(); // chunk hash -> Promise<{ status, text }>

function remember(hash, p) {
  chunks.set(hash, p);
  p.catch(() => chunks.delete(hash));
  while (chunks.size > CHUNK_CACHE) chunks.delete(chunks.keys().next().value);
}

function prefetchChunks(blockText, height) {
  let block;
  try {
    block = JSON.parse(blockText).result;
  } catch {
    return;
  }
  for (const ch of block?.chunks ?? []) {
    if (ch.height_included !== height || chunks.has(ch.chunk_hash)) continue;
    stats.prefetched++;
    remember(ch.chunk_hash, forward(JSON.stringify({ jsonrpc: "2.0", id: "prefetch", method: "chunk", params: { chunk_id: ch.chunk_hash } })));
  }
}

async function neardataBlock(height) {
  const u = NEARDATA;
  if (!u) return null;
  const now = Date.now();
  if (!usable(u, now) || u.tokens < 1) return null;
  u.tokens -= 1;
  u.inflight++;
  const t0 = Date.now();
  try {
    const res = await fetch(`${u.url}/v0/block/${height}`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 429 || res.status >= 500) {
      cool(u, 5_000);
      return null;
    }
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || !d.block) return null; // missing height: RPC answers with the canonical UNKNOWN_BLOCK error
    for (const s of d.shards ?? []) {
      const c = s.chunk;
      if (!c?.header?.chunk_hash) continue;
      const view = { author: c.author, header: c.header, transactions: (c.transactions ?? []).map((t) => t.transaction), receipts: c.receipts ?? [] };
      remember(c.header.chunk_hash, Promise.resolve({ status: 200, text: JSON.stringify({ jsonrpc: "2.0", id: "neardata", result: view }) }));
    }
    u.ok++;
    u.ms += Date.now() - t0;
    stats.neardataBlocks++;
    return d.block;
  } catch {
    cool(u, 5_000);
    return null;
  } finally {
    u.inflight--;
  }
}

function withId(text, id) {
  try {
    const j = JSON.parse(text);
    j.id = id;
    return JSON.stringify(j);
  } catch {
    return text;
  }
}

async function handle(raw) {
  let req;
  try {
    req = JSON.parse(raw);
  } catch {
    return forward(raw);
  }
  if (Array.isArray(req) || !req || typeof req !== "object") return forward(raw);
  const { method, params, id } = req;
  stats.methods[method] = (stats.methods[method] ?? 0) + 1;
  if (method === "chunk") {
    const hash = typeof params?.chunk_id === "string" ? params.chunk_id : Array.isArray(params) ? params[0] : null;
    if (typeof hash === "string") {
      const hit = chunks.get(hash);
      if (hit) stats.chunkHits++;
      else stats.chunkMisses++;
      const p = hit ?? forward(JSON.stringify({ jsonrpc: "2.0", id: "chunk", method: "chunk", params: { chunk_id: hash } }));
      if (!hit) remember(hash, p);
      const r = await p;
      return { status: r.status, text: withId(r.text, id) };
    }
  }
  const height = method === "block" && params && Number.isInteger(params.block_id) ? params.block_id : null;
  if (height !== null) {
    const b = await neardataBlock(height);
    if (b) return { status: 200, text: JSON.stringify({ jsonrpc: "2.0", id, result: b }) };
  }
  const r = await forward(raw);
  if (height !== null && r.status === 200) prefetchChunks(r.text, height);
  return r;
}

const show = (u) => ({ url: u.url, rps: u.rps, ok: u.ok, errors: u.errors, avgMs: u.ok ? Math.round(u.ms / u.ok) : null, coolingMs: Math.max(0, u.coolUntil - Date.now()) });

createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "rpc-proxy", ...stats, cachedChunks: chunks.size, upstreams: UPSTREAMS.map(show), neardata: NEARDATA ? show(NEARDATA) : null }));
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end();
  }
  const parts = [];
  req.on("data", (c) => parts.push(c));
  req.on("end", () => {
    stats.requests++;
    handle(Buffer.concat(parts).toString("utf8")).then(
      (r) => {
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(r.text);
      },
      (e) => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { name: "UPSTREAM", cause: { name: "UPSTREAM" }, message: String(e?.message ?? e) } }));
      },
    );
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ msg: "rpc proxy listening", port: PORT, strategy: STRATEGY, upstreams: UPSTREAMS.map((u) => `${u.url}@${u.rps}rps`), neardata: NEARDATA ? `${NEARDATA.url}@${NEARDATA.rps}rps` : null }));
});
