#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, ".data");
const LOGS = join(DATA, "logs");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const listArg = (name) =>
  (argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const opts = {
  fresh: flag("fresh"),
  noWeb: flag("no-web"),
  servicesOnly: flag("services-only"),
  dryRun: flag("dry-run"),
  force: flag("force"),
  watch: flag("watch"),
  skip: new Set(listArg("skip")),
  help: flag("help") || argv.includes("-h"),
};
const known = new Set(["--fresh", "--no-web", "--services-only", "--dry-run", "--force", "--watch", "--help", "-h"]);
const unknown = argv.filter((a) => !known.has(a) && !a.startsWith("--skip="));

const USAGE = `Usage: node scripts/dev.mjs [options]

Brings up the local Drixie stack: docker (postgres :55433, redis :56380) → near-sandbox :3030 →
base accounts (root, relayer, players; if missing) → db migrate → funds contract (drixie.test.near, if
contracts/funds/res/*.wasm is built) → relayer :4110, indexer :4200, api :4000, agents :4300, mcp :4400,
world :4500, nav :4700, web :3000, then the house investors :4600 → health checks → summary.

Options:
  --fresh           reset sandbox chain + Postgres + Redis before starting (refuses while services run, unless --force)
  --no-web          do not start the web app
  --services-only   skip infra/chain/deploy/migrate; start only the services
  --skip=a,b        do not start these services (relayer,indexer,api,agents,mcp,world,nav,desk,web)
  --dry-run         probe everything and print the plan without changing anything
  --force           allow --fresh while services are listening
  --watch           run services with their "dev" (file-watching) script; default is "start", which keeps one
                    node process per service instead of watcher + esbuild + node (less memory on a 16 GB machine)
  -h, --help        this help
`;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { dim: paint("2"), bold: paint("1"), red: paint("31"), green: paint("32"), yellow: paint("33"), blue: paint("34"), magenta: paint("35"), cyan: paint("36") };
const TAG_COLORS = [c.cyan, c.magenta, c.yellow, c.blue, c.green, paint("96"), paint("95"), paint("93"), paint("94")];
const tagColor = new Map();
const TAG_WIDTH = 8;
function prefix(tag) {
  if (!tagColor.has(tag)) tagColor.set(tag, TAG_COLORS[tagColor.size % TAG_COLORS.length]);
  return tagColor.get(tag)(`${tag.padEnd(TAG_WIDTH)} │`);
}
const say = (msg) => console.log(`${prefix("dev")} ${msg}`);
const warn = (msg) => console.log(`${prefix("dev")} ${c.yellow("!")} ${msg}`);
const fail = (msg) => console.log(`${prefix("dev")} ${c.red("✗")} ${msg}`);
const ok = (msg) => console.log(`${prefix("dev")} ${c.green("✓")} ${msg}`);
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

function readDotEnv() {
  const file = join(ROOT, ".env");
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let v = line.slice(i + 1).trim();
    const q = v[0];
    if (q === '"' || q === "'") v = v.slice(1, Math.max(1, v.indexOf(q, 1)));
    else v = v.replace(/\s+#.*$/, "").trim();
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
const dotEnv = readDotEnv();
const envOf = (k) => (process.env[k] ?? dotEnv[k] ?? "").trim() || undefined;
const NETWORK = envOf("NEAR_NETWORK") ?? "sandbox";
const RPC_URL = (envOf("NEAR_RPC_URL") ?? "http://127.0.0.1:3030").replace(/\/$/, "");
const DEPLOYMENT_FILE = join(DATA, `deployment.${NETWORK}.json`);
const FUNDS_DEPLOYMENT_FILE = join(DATA, `deployment.funds.${NETWORK}.json`);

const children = new Set();
let shuttingDown = false;

function pipeLines(child, tag, file) {
  const out = file ? createWriteStream(file, { flags: "a" }) : null;
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        process.stdout.write(`${prefix(tag)} ${line}\n`);
        out?.write(`${stripAnsi(line)}\n`);
      }
    });
    stream.on("end", () => {
      if (buf) {
        process.stdout.write(`${prefix(tag)} ${buf}\n`);
        out?.write(`${stripAnsi(buf)}\n`);
        buf = "";
      }
    });
  }
  child.on("close", () => out?.end());
}

function spawnTagged(tag, cmd, args, { cwd = ROOT, env = {}, logFile } = {}) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: useColor ? "1" : "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group, so Ctrl+C can stop pnpm → tsx → node as one unit
  });
  children.add(child);
  child.on("close", () => children.delete(child));
  pipeLines(child, tag, logFile);
  return child;
}

function run(tag, cmd, args, o = {}) {
  return new Promise((res) => {
    let child;
    try {
      child = spawnTagged(tag, cmd, args, o);
    } catch (err) {
      fail(`${tag}: could not start ${cmd}: ${err.message}`);
      return res(-1);
    }
    child.on("error", (err) => {
      fail(`${tag}: ${cmd} failed to start: ${err.message}`);
      res(-1);
    });
    child.on("close", (code, signal) => res(code ?? (signal ? 128 : -1)));
  });
}

function killGroup(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {

    }
  }
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  const live = [...children];
  if (live.length) say(`stopping ${live.length} process${live.length === 1 ? "" : "es"} started by this runner…`);
  for (const ch of live) killGroup(ch, "SIGTERM");
  const deadline = Date.now() + 10_000;
  while ([...children].length && Date.now() < deadline) await sleep(200);
  for (const ch of children) killGroup(ch, "SIGKILL");
  if (!opts.servicesOnly && !opts.dryRun) {
    say(c.dim("sandbox node and docker containers keep running: ./scripts/sandbox.sh stop · docker compose down"));
  }
  process.exit(code);
}
let interrupts = 0;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    interrupts += 1;
    if (interrupts > 1) {
      for (const ch of children) killGroup(ch, "SIGKILL");
      process.exit(130);
    }
    console.log("");
    void shutdown(sig === "SIGINT" ? 130 : 143);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portOpen(port, host) {
  return new Promise((res) => {
    const s = connect({ port, host });
    const done = (v) => {
      s.destroy();
      res(v);
    };
    s.setTimeout(700, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}
const listening = async (port) => (await portOpen(port, "127.0.0.1")) || (await portOpen(port, "::1"));

async function httpGet(url, timeoutMs = 2_500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    const text = await res.text().catch(() => "");
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {

    }
    return { status: res.status, json };
  } catch {
    return null;
  }
}

async function rpc(method, params) {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "dev", method, params }),
      signal: AbortSignal.timeout(4_000),
    });
    const body = await res.json();
    return body.error ? null : body.result;
  } catch {
    return null;
  }
}
async function chainStatus() {
  const r = await httpGet(`${RPC_URL}/status`, 3_000);
  return r?.json?.chain_id ? { chainId: r.json.chain_id, height: r.json.sync_info?.latest_block_height } : null;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function deploymentState() {
  const dep = readJson(DEPLOYMENT_FILE);
  if (!dep) return { needed: true, reason: `${rel(DEPLOYMENT_FILE)} is missing`, dep: null };
  const status = await chainStatus();
  if (!status) return { needed: true, reason: "sandbox RPC is not reachable", dep };
  if (dep.chainId && dep.chainId !== status.chainId) {
    return { needed: true, reason: `chain was reset (deployment ${dep.chainId}, node ${status.chainId})`, dep };
  }
  const acct = await rpc("query", { request_type: "view_account", finality: "final", account_id: dep.root });
  if (!acct) return { needed: true, reason: `root account ${dep.root} does not exist on this chain`, dep };
  return { needed: false, reason: "base accounts match the running chain", dep };
}

const rel = (p) => p.replace(`${ROOT}/`, "");

const SERVICES = [
  {
    name: "relayer", pkg: "@listed/relayer", dir: "services/relayer", port: 4110, tier: 1, owner: "chain",
    health: "/health", url: "http://localhost:4110",
    judge: (r) => (r.status === 200 ? (r.json?.ok === false ? ["degraded", r.json?.fundsContractLive === false ? "funds contract not live" : "reports ok:false"] : ["up"]) : ["degraded", `HTTP ${r.status}`]),
  },
  {
    name: "indexer", pkg: "@listed/indexer", dir: "services/indexer", port: 4200, tier: 1, owner: "backend",
    health: "/health", url: "http://localhost:4200",
    judge: (r) => (r.status === 200 ? ["up", r.json?.phase ? `phase ${r.json.phase}` : ""] : ["degraded", r.json?.phase ? `phase ${r.json.phase}` : `HTTP ${r.status}`]),
  },
  {
    name: "api", pkg: "@listed/api", dir: "services/api", port: 4000, tier: 1, owner: "backend",
    health: "/v1/health", url: "http://localhost:4000/v1",
    judge: (r) => (r.status === 200 ? (r.json?.ok === false ? ["degraded", "reports ok:false"] : ["up", r.json?.indexerLagBlocks != null ? `indexer lag ${r.json.indexerLagBlocks} blocks` : ""]) : ["degraded", `HTTP ${r.status}`]),
  },
  {
    name: "agents", pkg: "@listed/agents", dir: "services/agents", port: 4300, tier: 2, owner: "agents",
    health: "/health", url: "http://localhost:4300",
    judge: (r) => (r.status < 500 ? ["up", r.json?.waiting ? String(r.json.waiting) : ""] : ["degraded", `HTTP ${r.status}`]),
  },
  {
    name: "mcp", pkg: "@listed/mcp", dir: "services/mcp", port: 4400, tier: 2, owner: "agents",
    health: "/health", url: "http://localhost:4400",
    judge: (r) => (r.status < 500 ? ["up"] : ["degraded", `HTTP ${r.status}`]),
  },
  {

    name: "world", pkg: "@listed/world", dir: "services/world", port: 4500, tier: 2, owner: "world",
    health: "/health", url: "http://localhost:4500",
    judge: (r) => (r.status === 200 ? ["up", r.json?.ai?.state === "waiting" ? "headlines stored unscored (no AI key)" : ""] : ["degraded", r.json?.db === false ? "Postgres unreachable" : `HTTP ${r.status}`]),
  },
  {

    name: "nav", pkg: "@listed/nav", dir: "services/nav", port: 4700, tier: 2, owner: "nav",
    health: "/health", url: "http://localhost:4700",
    judge: (r) =>
      r.status === 200
        ? ["up", r.json?.waitingFor ? `waiting for ${r.json.waitingFor}` : r.json?.lastBell != null ? `bell ${r.json.lastBell}` : ""]
        : ["degraded", r.json?.waitingFor ? `waiting for ${r.json.waitingFor}` : `HTTP ${r.status}`],
  },
  {

    name: "desk", pkg: "@listed/desk", dir: "services/desk", port: 4600, tier: 3, owner: "desk",
    health: "/health", url: "http://localhost:4600",
    env: { DESK_LOG_FILE: "-" }, // the runner already writes stdout to .data/logs/desk.log
    judge: (r) =>
      r.status === 200
        ? r.json?.waitingFor
          ? ["degraded", "funds contract not deployed: pnpm tsx scripts/deploy-funds.ts"]
          : ["up", r.json?.enabled === false ? "DESK_ENABLED=0 (idle)" : `${(r.json?.investors ?? []).length} house investors · ${Object.entries(r.json?.counts ?? {}).filter(([k]) => k !== "errors").reduce((a, [, v]) => a + Number(v), 0)} actions`]
        : ["degraded", `HTTP ${r.status}`],
  },
  {
    name: "web", pkg: "web", dir: "apps/web", port: 3000, tier: 2, owner: "app UI", timeoutMs: 180_000,
    health: "/", url: "http://localhost:3000",
    judge: (r) => (r.status < 500 ? ["up"] : ["degraded", `HTTP ${r.status}`]),
  },
];

async function probeService(svc) {
  for (const host of ["127.0.0.1", "localhost"]) {
    const r = await httpGet(`http://${host}:${svc.port}${svc.health}`);
    if (r) {
      const [state, detail = ""] = svc.judge(r);
      return { state, detail };
    }
  }
  return (await listening(svc.port)) ? { state: "degraded", detail: `port open, ${svc.health} not answering` } : { state: "down", detail: "" };
}

function scriptFor(svc) {
  const pkg = readJson(join(ROOT, svc.dir, "package.json"));
  const prefer = svc.name === "web" || opts.watch ? "dev" : "start";
  if (pkg?.scripts?.[prefer]) return prefer;
  return pkg?.scripts?.dev ? "dev" : "start";
}

function missingFor(svc) {
  const pkgFile = join(ROOT, svc.dir, "package.json");
  if (!existsSync(pkgFile)) return `${svc.dir}/package.json`;
  const pkg = readJson(pkgFile);
  const script = pkg?.scripts?.[scriptFor(svc)];
  if (!script) return `"dev" or "start" script in ${svc.dir}/package.json`;
  const entry = script.match(/(?:^|\s)((?:\.\/)?src\/[\w./-]+\.(?:ts|tsx|mts|js|mjs))\b/)?.[1];
  if (entry && !existsSync(join(ROOT, svc.dir, entry))) return `${svc.dir}/${entry.replace(/^\.\//, "")}`;
  if (/\bnext\b/.test(script) && !existsSync(join(ROOT, svc.dir, "src/app"))) return `${svc.dir}/src/app`;
  if (!existsSync(join(ROOT, svc.dir, "node_modules"))) return `${svc.dir}/node_modules (dependencies not installed)`;
  return null;
}

async function waitHealthy(svc, child) {
  const timeoutMs = svc.timeoutMs ?? 90_000;
  const startedAt = Date.now();
  let last = { state: "down", detail: "" };
  while (Date.now() - startedAt < timeoutMs && !shuttingDown) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      return { state: "crashed", detail: `exited ${child.exitCode ?? child.signalCode}; see .data/logs/${svc.name}.log` };
    }
    last = await probeService(svc);
    if (last.state === "up") return last;

    if (last.state === "degraded" && Date.now() - startedAt > 15_000) return last;
    await sleep(500);
  }
  return last.state === "down" ? { state: "timeout", detail: `no answer on :${svc.port}${svc.health} after ${Math.round(timeoutMs / 1000)}s` } : last;
}

async function bringUp(svc, results) {
  if (await listening(svc.port)) {
    const p = await probeService(svc);
    results.set(svc.name, { ...p, how: "external", note: "already running; left as is" });
    return;
  }
  const missing = missingFor(svc);
  if (missing) {
    results.set(svc.name, { state: "missing", how: "-", detail: `needs ${missing} (${svc.owner} area)` });
    return;
  }
  if (opts.dryRun) {
    results.set(svc.name, { state: "would start", how: "-", detail: `pnpm --filter ${svc.pkg} ${scriptFor(svc)}` });
    return;
  }
  if (svc.prepare) await svc.prepare();
  const script = scriptFor(svc);
  say(`starting ${c.bold(svc.name)} (pnpm --filter ${svc.pkg} ${script})`);
  const child = spawnTagged(svc.name, "pnpm", ["--filter", svc.pkg, "run", script], { logFile: join(LOGS, `${svc.name}.log`), env: svc.env ?? {} });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) warn(`${svc.name} exited (${code ?? signal}); see .data/logs/${svc.name}.log`);
  });
  const r = await waitHealthy(svc, child);
  results.set(svc.name, { ...r, how: "started", pid: child.pid });
  if (r.state === "up") ok(`${svc.name} healthy at ${svc.url}${r.detail ? c.dim(` (${r.detail})`) : ""}`);
  else warn(`${svc.name}: ${r.state}${r.detail ? ` — ${r.detail}` : ""}`);
}

async function stepInfra() {
  if (opts.dryRun) {
    const pg = await listening(55433);
    const rd = await listening(56380);
    return say(`infra: postgres :55433 ${pg ? "up" : "down → docker compose up -d"} · redis :56380 ${rd ? "up" : "down → docker compose up -d"}`);
  }
  say("infra: docker compose up -d --wait (postgres :55433, redis :56380)");
  const code = await run("infra", "docker", ["compose", "up", "-d", "--wait", "postgres", "redis"]);
  if (code !== 0) throw new Error("docker compose failed. Is Docker running? (open Docker Desktop, then re-run)");
}

async function stepChain() {
  const script = join(ROOT, "scripts/sandbox.sh");
  if (!existsSync(script)) throw new Error("scripts/sandbox.sh is missing (chain area)");
  if (opts.dryRun) {
    const s = await chainStatus();
    return say(`chain: ${s ? `sandbox up (${s.chainId}, height ${s.height})` : "sandbox down → ./scripts/sandbox.sh start"}${opts.fresh ? " · --fresh → ./scripts/sandbox.sh reset" : ""}`);
  }
  const code = await run("chain", script, [opts.fresh ? "reset" : "start"]);
  if (code !== 0) throw new Error(`./scripts/sandbox.sh ${opts.fresh ? "reset" : "start"} failed (see .data/sandbox.log)`);
}

async function stepResetData() {
  say("fresh: dropping Postgres schemas and flushing Redis");
  const sql = "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;";
  const pg = await run("infra", "docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "listed", "-d", "listed", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql]);
  if (pg !== 0) throw new Error("could not reset Postgres");
  const rd = await run("infra", "docker", ["compose", "exec", "-T", "redis", "redis-cli", "FLUSHALL"]);
  if (rd !== 0) throw new Error("could not flush Redis");
}

async function stepDeploy() {
  const st = await deploymentState();
  if (!st.needed) return ok(`deploy: ${st.reason} (${st.dep?.root})`);
  if (opts.dryRun) return say(`deploy: needed — ${st.reason} → tsx scripts/deploy-local.ts`);
  say(`deploy: ${st.reason} → tsx scripts/deploy-local.ts`);
  const code = await run("deploy", TSX, ["scripts/deploy-local.ts"]);
  if (code !== 0) throw new Error("deploy failed (see output above)");
}

async function stepMigrate() {
  const pkg = readJson(join(ROOT, "packages/db/package.json"));
  if (!pkg?.scripts?.migrate) return warn("migrate: packages/db has no \"migrate\" script yet (backend area); skipped");
  if (!existsSync(join(ROOT, "packages/db/drizzle"))) return warn("migrate: packages/db/drizzle has no migrations yet (backend area); skipped");
  if (opts.dryRun) return say("migrate: pnpm --filter @listed/db migrate (idempotent)");
  const code = await run("migrate", "pnpm", ["--filter", "@listed/db", "migrate"]);
  if (code !== 0) throw new Error("db migrate failed (see output above)");
}

function fundsWasm() {
  const dir = join(ROOT, "contracts/funds/res");
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".wasm")).map((f) => join(dir, f))[0] ?? null;
  } catch {
    return null;
  }
}

async function stepFunds() {
  const wasm = fundsWasm();
  const dep = readJson(FUNDS_DEPLOYMENT_FILE);
  const status = await chainStatus();
  if (!wasm) return warn("funds: contracts/funds/res/*.wasm not built yet; skipped (house investors and nav wait for it)");
  let reason = null;
  if (!dep) reason = `${rel(FUNDS_DEPLOYMENT_FILE)} is missing`;
  else if (status && dep.chainId && dep.chainId !== status.chainId) reason = "chain was reset";
  else if (!dep.codeHash) reason = "contract not deployed yet";
  else if ((dep.funds ?? []).length < 5) reason = "funds not all created";
  else {
    try {
      if (statSync(wasm).mtimeMs > Date.parse(dep.updatedAt ?? dep.deployedAt ?? "")) reason = "funds wasm is newer than the deployment";
    } catch {

    }
  }
  if (!reason) return ok(`funds: ${dep.contract} · ${(dep.funds ?? []).length} funds`);
  if (opts.dryRun) return say(`funds: needed — ${reason} → tsx scripts/deploy-funds.ts --wait 0`);
  say(`funds: ${reason} → tsx scripts/deploy-funds.ts --wait 0`);
  const code = await run("funds", TSX, ["scripts/deploy-funds.ts", "--wait", "0"]);
  if (code !== 0 && code !== 2) warn("funds: deploy failed (see output above); nav and the house investors wait for it");
}

function printSummary(results, startedAt) {
  const rows = SERVICES.filter((s) => results.has(s.name)).map((s) => ({ s, r: results.get(s.name) }));
  const mark = (state) =>
    state === "up" ? c.green("● up") : state === "degraded" ? c.yellow("● degraded") : state === "would start" ? c.blue("○ would start") : state === "missing" ? c.dim("○ missing") : c.red(`● ${state}`);
  console.log("");
  console.log(c.bold(`Drixie local stack ${opts.dryRun ? "(dry run: nothing changed)" : `(${Math.round((Date.now() - startedAt) / 1000)}s)`}`));
  for (const { s, r } of rows) {
    const how = r.how === "external" ? c.dim(" external") : "";
    console.log(`  ${s.name.padEnd(8)} ${s.url.padEnd(26)} ${mark(r.state).padEnd(useColor ? 24 : 15)}${how}${r.detail ? c.dim(`  ${r.detail}`) : ""}`);
  }
  const dep = readJson(DEPLOYMENT_FILE);
  console.log(`  ${"chain".padEnd(8)} ${RPC_URL.padEnd(26)} ${dep ? `root ${dep.root} · relayer ${dep.relayer}` : "no base accounts (pnpm tsx scripts/deploy-local.ts)"}`);
  const fdep = readJson(FUNDS_DEPLOYMENT_FILE);
  console.log(`  ${"funds".padEnd(8)} ${(fdep?.contract ?? "-").padEnd(26)} ${fdep?.codeHash ? `${fdep.funds?.length ?? 0} funds · operator ${fdep.operator?.account}` : "not deployed (pnpm tsx scripts/deploy-funds.ts)"}`);
  console.log(`  ${"db".padEnd(8)} ${"postgres :55433".padEnd(26)} redis :56380`);
  const llmSet = !!envOf("AI_API_KEY");
  console.log(`  ${"llm".padEnd(8)} ${`AI_API_KEY ${llmSet ? "set" : "empty"}`.padEnd(26)} ${llmSet ? "fund managers decide every bell" : "fund managers hold and say so (never faked)"}`);
  const missing = rows.filter(({ r }) => r.state === "missing");
  if (missing.length) {
    console.log("");
    console.log(c.dim(`  not started (not built yet): ${missing.map(({ s, r }) => `${s.name} → ${r.detail}`).join("; ")}`));
  }
  console.log("");
  console.log(c.dim("  e2e: cd e2e && npm test   ·   screenshots: node scripts/screens.mjs   ·   logs: .data/logs/<service>.log"));
  if (!opts.dryRun && [...children].length) console.log(c.dim("  Ctrl+C stops the services started here."));
}

async function main() {
  if (opts.help) return console.log(USAGE);
  if (unknown.length) {
    console.error(`unknown option(s): ${unknown.join(" ")}\n\n${USAGE}`);
    process.exit(2);
  }
  if (NETWORK !== "sandbox") throw new Error(`NEAR_NETWORK=${NETWORK}: the dev runner is local only (sandbox).`);
  if (opts.servicesOnly && opts.fresh) throw new Error("--fresh resets the chain and database; it cannot be combined with --services-only.");
  const startedAt = Date.now();
  mkdirSync(LOGS, { recursive: true });
  if (!existsSync(join(ROOT, ".env"))) warn(".env not found; copy .env.example to .env (services read the repo-root .env)");
  if (!existsSync(TSX)) throw new Error("node_modules/.bin/tsx missing; install root dependencies first");

  const wanted = SERVICES.filter((s) => !opts.skip.has(s.name) && !(opts.noWeb && s.name === "web"));

  if (opts.fresh && !opts.force) {
    const busy = [];
    for (const s of SERVICES) if (await listening(s.port)) busy.push(`${s.name} :${s.port}`);
    if (busy.length) {
      throw new Error(`--fresh would wipe the chain and database under running services (${busy.join(", ")}). Stop them first, or add --force.`);
    }
  }

  if (!opts.servicesOnly) {

    await Promise.all([stepInfra(), stepChain()]);
    if (opts.fresh && !opts.dryRun) await stepResetData();
    await Promise.all([stepDeploy(), stepMigrate()]);
    await stepFunds();
  }

  const results = new Map();
  for (const tier of [1, 2, 3]) {
    await Promise.all(wanted.filter((s) => s.tier === tier).map((s) => bringUp(s, results)));
    if (shuttingDown) return;
  }
  printSummary(results, startedAt);

  if (opts.dryRun || children.size === 0) {
    if (!opts.dryRun) say("nothing was started by this runner; exiting.");
    return;
  }

  await new Promise(() => {});
}

main().catch((err) => {
  fail(err.message);
  void shutdown(1);
});
