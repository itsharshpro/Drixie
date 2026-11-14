import { dz, fundBrainBills, fundNfts, fundNotes, fundState, fundWeightsHistory, riskProfiles, type Db } from "@listed/db";
import type { FeedKind, FundCandleInterval, NavRange, VaultInfo } from "@listed/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../deps";
import { notFound, sendError } from "../errors";
import { pageLimit } from "../lib/cursor";
import { TtlCache } from "../lib/ttl-cache";
import { includeHouse, normalizeAccount, optionalPlayer, requirePlayer } from "../lib/player";
import { parse, requireServiceToken } from "../lib/validate";
import { assetDetail, listAssets } from "../funds/assets";
import { fundBacktest, weightsFor } from "../funds/backtest";
import { allFunds, microToUsd, nearNum, round, gameRate } from "../funds/common";
import { FEED_KINDS, feedPage } from "../funds/feed";
import { basketSvg, listNfts, nftByToken, nftMetadata, toFundNft, tokenSvg } from "../funds/nft";
import { fundPortfolio } from "../funds/portfolio";
import { assetCandles } from "../funds/prices";
import { coinCandles, fundDetail, listFunds, movesPage, navSeries, reputationHistory } from "../funds/queries";
import { riskProfile } from "../funds/risk";
import { seasonView } from "../funds/season";
import { fundSseFrame, parseFundTopics, type FundsHub } from "../funds/stream";

const FUND_ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;
const RANGES = new Set<NavRange>(["1D", "4D", "SEASON", "ALL"]);
const INTERVALS = new Set<FundCandleInterval>(["5m", "15m", "1h", "1d"]);

function fundId(raw: string): string {
  const id = raw.trim().toLowerCase();
  if (!FUND_ID_RE.test(id)) throw notFound("No fund with that id. The funds are atlas, meridian, nova, orion and kite.", "fund_not_found");
  return id;
}

async function requireFund(db: Db, raw: string) {
  const id = fundId(raw);
  const f = (await allFunds(db)).find((r) => r.id === id);
  if (!f) throw notFound("No fund with that id yet. The funds appear once the funds contract is deployed.", "fund_not_found");
  return f;
}

const riskSchema = z.object({
  drawdown: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  horizon: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  goal: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

const tier = z.enum(["best", "primary", "small"]);
const think = z.enum(["normal", "deep"]);
const noteSchema = z.object({
  fund: z.string().trim().toLowerCase().regex(FUND_ID_RE),
  bell: z.number().int().min(0).max(10_000_000),
  note: z.string().trim().min(1).max(600),
  think: think.default("normal"),
  tier: tier.default("primary"),
  autopilot: z.boolean().default(false),
  adjusted: z.boolean().default(false),
  at: z.string().datetime().optional(),
});
const billSchema = z.object({
  id: z.string().trim().min(1).max(100),
  fund: z.string().trim().toLowerCase().regex(FUND_ID_RE),
  bell: z.number().int().min(0).max(10_000_000).nullish(),
  at: z.string().datetime().optional(),
  tier,
  think: think.default("normal"),
  aiCostUsd: z.number().min(0).max(1000).default(0),
  multiplier: z.number().min(0).max(1_000_000).default(20000),
  billUsd: z.number().min(0).max(100_000_000),
});

function vaultOf(raw: Record<string, unknown> | null, updatedAt: Date | null, rate: number): VaultInfo {
  const v = raw ?? {};
  const str = (...keys: string[]): string | null => {
    for (const k of keys) {
      const x = v[k];
      if (typeof x === "string" && /^\d+$/.test(x)) return x;
      if (typeof x === "number") return String(x);
    }
    return null;
  };
  const balance = str("balance", "near", "total_near", "vault") ?? "0";
  const reserve = str("reserve", "reserve_near") ?? "0";
  const liabMicro = str("liabilities_micro_usd", "liabilities_usd", "liabilities");
  const assetsMicro = str("assets_micro_usd", "assets_usd");
  const liabilitiesUsd = liabMicro ? microToUsd(liabMicro) : 0;

  const vaults = str("vaults") ?? "0";
  const assetsUsd = assetsMicro ? microToUsd(assetsMicro) : (nearNum(vaults) + nearNum(reserve)) * rate;
  const covBps = str("coverage_bps");
  return {
    balance,
    reserve,
    liabilitiesUsd: round(liabilitiesUsd, 2),
    assetsUsd: round(assetsUsd, 2),
    coveragePct: covBps ? Number(covBps) / 100 : liabilitiesUsd > 0 ? round((assetsUsd / liabilitiesUsd) * 100, 2) : null,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
  };
}

function svgReply(reply: FastifyReply, svg: string | null) {
  if (!svg) return sendError(reply, 404, "nft_not_found", "No NFT art for that token yet.");
  return reply.header("content-type", "image/svg+xml; charset=utf-8").header("cache-control", "public, max-age=60").send(svg);
}

export function fundsRoutes(app: FastifyInstance, deps: AppDeps & { fundsHub: FundsHub }): void {
  const { db } = deps;
  const fundsCache = new TtlCache<Awaited<ReturnType<typeof listFunds>>>(2_000, 4);
  const assetsCache = new TtlCache<Awaited<ReturnType<typeof listAssets>>>(10_000, 4);
  const seasonCache = new TtlCache<Awaited<ReturnType<typeof seasonView>>>(5_000, 4);
  const detailCache = new TtlCache<Awaited<ReturnType<typeof fundDetail>>>(2_000, 32);
  const backtestCache = new TtlCache<NonNullable<Awaited<ReturnType<typeof fundBacktest>>>>(180_000, 64);

  app.get("/funds", async () => fundsCache.get("all", () => listFunds(db)));

  app.get<{ Params: { id: string } }>("/funds/:id", async (req) => {
    const id = fundId(req.params.id);
    const d = await detailCache.get(id, () => fundDetail(db, id));
    if (!d) throw notFound("No fund with that id yet. The funds appear once the funds contract is deployed.", "fund_not_found");
    return d;
  });

  app.get<{ Params: { id: string }; Querystring: { range?: string } }>("/funds/:id/nav", async (req) => {
    const f = await requireFund(db, req.params.id);
    const r = (req.query.range ?? "SEASON").toUpperCase() as NavRange;
    return navSeries(db, f.id, RANGES.has(r) ? r : "SEASON");
  });

  app.get<{ Params: { id: string }; Querystring: { interval?: string; limit?: string } }>("/funds/:id/candles", async (req) => {
    const f = await requireFund(db, req.params.id);
    const i = (req.query.interval ?? "15m") as FundCandleInterval;
    return coinCandles(db, f.id, INTERVALS.has(i) ? i : "15m", pageLimit(req.query.limit, 200, 1000));
  });

  app.get<{ Params: { id: string }; Querystring: { from?: string; interval?: string } }>("/funds/:id/backtest", async (req) => {
    const id = fundId(req.params.id);

    const f = (await allFunds(db)).find((r) => r.id === id);
    if (!weightsFor(id, f?.weights)) throw notFound("No fund with that id. The funds are atlas, meridian, nova, orion and kite.", "fund_not_found");
    const interval = req.query.interval === "1d" ? "1d" : "1h";
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from ?? "") ? (req.query.from as string) : "";
    const w = (f?.weights ?? []).filter((x) => x.bps > 0).map((x) => `${x.asset}:${x.bps}`).join(",");
    const r = await backtestCache.get(`${id}|${interval}|${from}|${w}`, async () => (await fundBacktest(db, id, f?.weights, { from: from || undefined, interval }))!);
    return r;
  });

  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>("/funds/:id/moves", async (req) => {
    const f = await requireFund(db, req.params.id);
    return movesPage(db, f.id, req.query.cursor, pageLimit(req.query.limit, 20, 100));
  });

  app.get<{ Querystring: { cursor?: string; limit?: string; fund?: string } }>("/moves", async (req) => {
    const fund = req.query.fund ? fundId(req.query.fund) : null;
    return movesPage(db, fund, req.query.cursor, pageLimit(req.query.limit, 20, 100));
  });

  app.get<{ Params: { id: string } }>("/funds/:id/reputation", async (req) => reputationHistory(db, await requireFund(db, req.params.id)));

  app.get("/assets", async () => assetsCache.get("all", () => listAssets(db)));

  app.get<{ Params: { id: string } }>("/assets/:id", async (req) => {
    const a = await assetDetail(db, decodeURIComponent(req.params.id));
    if (!a) throw notFound("That asset isn't in the Drixie universe.", "asset_not_found");
    return a;
  });

  app.get<{ Params: { id: string }; Querystring: { interval?: string; limit?: string } }>("/assets/:id/candles", async (req) => {
    const id = decodeURIComponent(req.params.id);
    const a = await assetDetail(db, id);
    if (!a) throw notFound("That asset isn't in the Drixie universe.", "asset_not_found");
    const i = (req.query.interval ?? "1h") as FundCandleInterval;
    const interval = INTERVALS.has(i) ? i : "1h";
    return { asset: a.id, interval, candles: await assetCandles(db, a.id, interval, pageLimit(req.query.limit, 200, 1000)) };
  });

  app.get("/me/portfolio", async (req) => {
    const p = await requirePlayer(deps, req);
    return fundPortfolio(db, p.account);
  });

  app.get<{ Params: { account: string } }>("/funds/portfolio/:account", async (req) => fundPortfolio(db, normalizeAccount(req.params.account)));

  app.post("/risk-profile", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const answers = parse(riskSchema, req.body);
    const list = await fundsCache.get("all", () => listFunds(db));
    const res = riskProfile(answers, list.items);
    let account: string | null = null;
    try {
      account = (await optionalPlayer(deps, req))?.account ?? null;
    } catch {
      account = null;
    }
    await db
      .insert(riskProfiles)
      .values({ account, answers, profile: res.profile, points: res.points, recommended: res.recommended.map((r) => r.fund) })
      .catch(() => undefined);
    return res;
  });

  app.get<{ Querystring: { include?: string } }>("/season", async (req) => {
    const house = includeHouse(req.query.include);
    return seasonCache.get(house ? "house" : "plain", () => seasonView(db, deps.cfg.root, house));
  });

  const feedHandler = async (req: { query: { kind?: string; kinds?: string; fund?: string; cursor?: string; limit?: string } }) => {
    const raw = (req.query.kinds ?? req.query.kind ?? "").split(",").map((s) => s.trim());
    const kinds = raw.filter((k): k is FeedKind => (FEED_KINDS as string[]).includes(k));
    const fund = req.query.fund ? fundId(req.query.fund) : null;
    return feedPage(db, deps.cfg.root, { kinds, fund, cursor: req.query.cursor, limit: pageLimit(req.query.limit, 30, 100) });
  };
  app.get<{ Querystring: { kind?: string; kinds?: string; fund?: string; cursor?: string; limit?: string } }>("/feed", feedHandler);
  app.get<{ Querystring: { kind?: string; kinds?: string; fund?: string; cursor?: string; limit?: string } }>("/funds/feed", feedHandler);

  app.get("/vault", async () => {
    const [r] = await db.select().from(fundState).where(dz.eq(fundState.key, "vault")).limit(1);
    return vaultOf((r?.value as Record<string, unknown> | undefined) ?? null, r?.updatedAt ?? null, await gameRate(db));
  });

  app.get<{ Querystring: { kind?: string; owner?: string; fund?: string; cursor?: string; limit?: string } }>("/nfts", async (req) => {
    const kind = req.query.kind && ["seat", "basket", "badge", "trophy"].includes(req.query.kind) ? req.query.kind : undefined;
    return listNfts(db, {
      kind,
      owner: req.query.owner ? normalizeAccount(req.query.owner) : undefined,
      fund: req.query.fund ? fundId(req.query.fund) : undefined,
      cursor: req.query.cursor,
      limit: pageLimit(req.query.limit, 30, 100),
    });
  });

  app.get<{ Params: { tokenId: string } }>("/nfts/:tokenId", async (req) => {
    const r = await nftByToken(db, decodeURIComponent(req.params.tokenId));
    if (!r) throw notFound("No NFT with that token id.", "nft_not_found");
    return toFundNft(r);
  });

  app.get<{ Params: { tokenId: string } }>("/nft/:tokenId/metadata", async (req) => {
    const r = await nftByToken(db, decodeURIComponent(req.params.tokenId));
    if (!r) throw notFound("No NFT with that token id.", "nft_not_found");
    return nftMetadata(r, deps.cfg.apiUrl);
  });

  app.get<{ Params: { fund: string; file: string } }>("/nft/basket/:fund/:file", async (req, reply) => {
    const m = /^(\d{1,9})(\.svg)?$/.exec(req.params.file);
    if (!m) return sendError(reply, 404, "nft_not_found", "Basket card editions are numbers, like /nft/basket/nova/12.svg.");
    return svgReply(reply, await basketSvg(db, fundId(req.params.fund), Number(m[1])));
  });

  for (const kind of ["seat", "trophy", "badge"] as const) {
    app.get<{ Params: { file: string } }>(`/nft/${kind}/:file`, async (req, reply) => {
      const key = decodeURIComponent(req.params.file).replace(/\.svg$/, "");
      if (kind !== "badge") return svgReply(reply, await tokenSvg(db, `${kind}:${key}`));
      const [b] = await db.select().from(fundNfts).where(dz.and(dz.eq(fundNfts.kind, "badge"), dz.eq(fundNfts.badgeKind, key))).limit(1);
      return svgReply(reply, b ? await tokenSvg(db, b.tokenId) : null);
    });
  }

  app.get<{ Params: { file: string } }>("/nft/:file", async (req, reply) => {
    const file = decodeURIComponent(req.params.file);
    if (!file.endsWith(".svg")) return sendError(reply, 404, "nft_not_found", "Use /nft/<token id>.svg for the art or /nfts/<token id> for the record.");
    return svgReply(reply, await tokenSvg(db, file.slice(0, -4)));
  });

  app.get<{ Querystring: { topics?: string; fund?: string } }>("/funds/stream", async (req, reply) => {
    const limits = deps.cfg.sse;
    const release = deps.fundsHub.reserve(req.ip, limits);
    if (!release) {
      reply.header("retry-after", "30");
      return sendError(reply, 429, "too_many_streams", "Too many live connections from this network. Close a tab and try again.");
    }
    const topics = parseFundTopics(req.query.topics);
    const fund = req.query.fund && FUND_ID_RE.test(req.query.fund) ? req.query.fund : null;
    reply.hijack();
    const raw = reply.raw;
    const headers: Record<string, string | number | string[]> = {};
    for (const [k, v] of Object.entries(reply.getHeaders())) if (v !== undefined) headers[k] = v as string;
    raw.writeHead(200, {
      ...headers,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let closed = false;
    let remove = () => {};
    let timer: NodeJS.Timeout | undefined;
    let lifetime: NodeJS.Timeout | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearTimeout(lifetime);
      remove();
      release();
    };
    const write = (frame: string) => {
      if (closed) return;
      if (raw.writableLength > limits.maxBufferedBytes) {
        close();
        raw.destroy();
        return;
      }
      raw.write(frame);
    };
    write(`retry: 3000\n\n`);
    const ping = () => write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    ping();
    remove = deps.fundsHub.add({ topics, fund, send: (e) => write(fundSseFrame(e)) });
    timer = setInterval(ping, 15_000);
    lifetime = setTimeout(() => {
      close();
      raw.end();
    }, limits.maxLifetimeMs);
    req.raw.on("close", close);
    raw.on("close", close);
    raw.on("error", close);
  });

  app.post("/internal/funds/notes", { bodyLimit: 256 * 1024 }, async (req) => {
    requireServiceToken(deps, req);
    const body = parse(z.union([z.object({ records: z.array(noteSchema).min(1).max(200) }), noteSchema]), req.body);
    const records = "records" in body ? body.records : [body];
    for (const r of records) {
      const at = r.at ? new Date(r.at) : new Date();
      await db
        .insert(fundNotes)
        .values({ fund: r.fund, bell: r.bell, note: r.note, think: r.think, tier: r.tier, autopilot: r.autopilot, adjusted: r.adjusted, at })
        .onConflictDoUpdate({
          target: [fundNotes.fund, fundNotes.bell],
          set: { note: r.note, think: r.think, tier: r.tier, autopilot: r.autopilot, adjusted: r.adjusted, at },
        });

      await db
        .update(fundWeightsHistory)
        .set({ note: r.note })
        .where(dz.and(dz.eq(fundWeightsHistory.fund, r.fund), dz.eq(fundWeightsHistory.bell, r.bell), dz.isNull(fundWeightsHistory.note)));
      await db.execute(dz.sql`UPDATE funds SET last_note = ${r.note} WHERE id = ${r.fund}`);
    }
    return { ok: true, stored: records.length };
  });

  app.post("/internal/funds/brain-bills", { bodyLimit: 512 * 1024 }, async (req) => {
    requireServiceToken(deps, req);
    const body = parse(z.object({ records: z.array(billSchema).min(1).max(500) }), req.body);
    let stored = 0;
    for (const r of body.records) {
      const res = await db
        .insert(fundBrainBills)
        .values({
          id: r.id,
          fund: r.fund,
          bell: r.bell ?? null,
          at: r.at ? new Date(r.at) : new Date(),
          tier: r.tier,
          think: r.think,
          aiCostUsd: r.aiCostUsd,
          multiplier: r.multiplier,
          usd: r.billUsd,
        })
        .onConflictDoNothing()
        .returning({ id: fundBrainBills.id });
      stored += res.length;
    }
    return { ok: true, stored, duplicates: body.records.length - stored };
  });

  app.get<{ Querystring: { since?: string; uncharged?: string } }>("/internal/funds/brain-bills", async (req) => {
    requireServiceToken(deps, req);
    const since = req.query.since && !Number.isNaN(Date.parse(req.query.since)) ? new Date(req.query.since) : new Date(0);
    const conds = [dz.gte(fundBrainBills.at, since)];
    if (req.query.uncharged === "1" || req.query.uncharged === "true") conds.push(dz.isNull(fundBrainBills.chargedBell));
    const rows = await db.select().from(fundBrainBills).where(dz.and(...conds)).orderBy(dz.asc(fundBrainBills.at)).limit(5000);
    return {
      records: rows.map((r) => ({
        id: r.id,
        fund: r.fund,
        bell: r.bell,
        at: r.at.toISOString(),
        tier: r.tier,
        think: r.think,
        aiCostUsd: r.aiCostUsd,
        multiplier: r.multiplier,
        billUsd: r.usd,
        chargedBell: r.chargedBell,
      })),
    };
  });
}
