import type { Move, NewsItem } from "@listed/shared";
import type { FundsApi } from "./api.js";
import type { ChainFund } from "./chain.js";
import type { DbPriceSource, PricePoint } from "./db-prices.js";
import type { UniverseAsset } from "./rules.js";

export interface AssetView extends UniverseAsset {
  name: string;
  price: number | null;

  ret1bell: number | null;
  ret1d: number | null;
  ret4d: number | null;

  vol: number | null;
  estimated: boolean;
  heldBy: { fund: string; bps: number }[];
}

export interface NewsView {
  title: string;
  at: string;
  sentiment: number | null;
  tickers: string[];
  reason: string | null;
}

export interface PeerFund {
  id: string;
  nav: number;
  coinPrice: number | null;
  premium: number | null;
  ret1d: number | null;
  retSeason: number | null;
  vsSpy: number | null;
  reputation: number;

  top: { asset: string; bps: number }[];
}

export interface MarketSnapshot {
  at: string;
  assets: AssetView[];
  spy: { price: number | null; change1d: number | null };
  news: NewsView[];
  funds: PeerFund[];

  lastMoves: Record<string, Move | null>;

  priceSource: "api" | "db" | "none";
}

const pct = (a: number, b: number | undefined): number | null => (b !== undefined && b > 0 && Number.isFinite(a) ? Number((((a - b) / b) * 100).toFixed(3)) : null);

function closeAt(points: readonly PricePoint[], t: number): number | undefined {
  let lo = 0;
  let hi = points.length - 1;
  let ans: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = points[mid] as PricePoint;
    if (p.t <= t) {
      ans = p.c;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function returnsFromPoints(points: readonly PricePoint[], bellMs = 15 * 60_000): { ret1bell: number | null; ret1d: number | null; ret4d: number | null; vol: number | null } {
  const p = points.filter((x) => Number.isFinite(x.c) && x.c > 0).sort((a, b) => a.t - b.t);
  if (p.length < 2) return { ret1bell: null, ret1d: null, ret4d: null, vol: null };
  const last = p[p.length - 1] as PricePoint;
  const day = p.filter((x) => x.t >= last.t - 24 * 3600_000);
  const rets: number[] = [];
  for (let i = 1; i < day.length; i++) rets.push(((day[i] as PricePoint).c - (day[i - 1] as PricePoint).c) / (day[i - 1] as PricePoint).c);
  const mean = rets.reduce((s, x) => s + x, 0) / Math.max(1, rets.length);
  const variance = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  return {
    ret1bell: pct(last.c, closeAt(p, last.t - bellMs) ?? (p[p.length - 2] as PricePoint).c),
    ret1d: pct(last.c, closeAt(p, last.t - 24 * 3600_000)),
    ret4d: pct(last.c, closeAt(p, last.t - 4 * 24 * 3600_000) ?? (p[0] as PricePoint).c),
    vol: rets.length >= 4 ? Number((Math.sqrt(variance) * 100).toFixed(3)) : null,
  };
}

export function returnsFromCloses(closes: readonly number[]): ReturnType<typeof returnsFromPoints> {
  return returnsFromPoints(closes.map((c, i) => ({ t: i * 15 * 60_000, c })));
}

async function mapLimit<T, R>(xs: readonly T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, xs.length) }, async () => {
    while (i < xs.length) {
      const k = i++;
      out[k] = await fn(xs[k] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

function newsView(n: NewsItem, ids: ReadonlySet<string>): NewsView {
  const tickers = [...new Set([...(n.companies ?? []), ...((n as unknown as { tickers?: string[] }).tickers ?? [])])].filter((t) => ids.has(t));
  return { title: n.title, at: n.publishedAt, sentiment: n.sentiment ?? null, tickers, reason: n.reason };
}

export interface SnapshotSources {
  api: FundsApi;
  db?: DbPriceSource | null;

  chainFunds?: () => Promise<ChainFund[]>;
}

export async function buildSnapshot(src: SnapshotSources, universe: readonly (UniverseAsset & { name?: string })[], now = new Date()): Promise<MarketSnapshot> {
  const { api } = src;
  const [assets, funds, news, chain] = await Promise.all([api.assets(), api.funds(), api.news(50), src.chainFunds ? src.chainFunds().catch(() => [] as ChainFund[]) : Promise.resolve([] as ChainFund[])]);
  const ids = new Set(universe.map((u) => u.id));
  const byId = new Map<string, NonNullable<typeof assets>["baskets"][number]["assets"][number]>();
  for (const b of assets?.baskets ?? []) for (const a of b.assets) byId.set(a.id, a);

  let series = new Map<string, PricePoint[]>();
  let priceSource: MarketSnapshot["priceSource"] = "none";
  const wanted = [...universe.map((u) => u.id), "SPY"];
  if (assets) {
    const candles = await mapLimit(wanted, 6, (id) => api.candles(id, "15m", 400));
    wanted.forEach((id, i) => series.set(id, (candles[i]?.candles ?? []).map((c) => ({ t: Date.parse(c.t), c: c.c }))));
    priceSource = "api";
  } else if (src.db) {
    try {
      series = await src.db.series(wanted, now.getTime() - 6 * 24 * 3600_000);
      priceSource = series.size ? "db" : "none";
    } catch {
      priceSource = "none";
    }
  }

  const holders = new Map<string, { fund: string; bps: number }[]>();
  for (const f of chain) for (const [asset, bps] of Object.entries(f.plan.weights)) holders.set(asset, [...(holders.get(asset) ?? []), { fund: f.id, bps }]);

  const views: AssetView[] = universe.map((u) => {
    const a = byId.get(u.id);
    const pts = series.get(u.id) ?? [];
    const r = returnsFromPoints(pts);
    return {
      ...u,
      name: a?.name ?? u.name ?? u.id,
      price: a?.price ?? (pts.length ? (pts[pts.length - 1] as PricePoint).c : null),
      ret1bell: r.ret1bell,
      ret1d: r.ret1d ?? a?.change1d ?? null,
      ret4d: r.ret4d,
      vol: r.vol,
      estimated: a?.estimated ?? u.kind === "startup",
      heldBy: a?.heldBy ?? holders.get(u.id) ?? [],
    };
  });
  const spyPts = series.get("SPY") ?? [];
  const spyR = returnsFromPoints(spyPts);
  const dayAgo = now.getTime() - 24 * 3600_000;

  const allNews = (news?.items ?? []).filter((n) => n.scored !== false);
  const fresh = allNews.filter((n) => Date.parse(n.publishedAt) >= dayAgo);
  const newsItems = (fresh.length ? fresh : allNews.slice(0, 15)).map((n) => newsView(n, ids));

  let peers: PeerFund[];
  const lastMoves: Record<string, Move | null> = {};
  if (funds?.items?.length) {
    peers = funds.items.map((f) => ({ id: f.id, nav: f.nav, coinPrice: f.coinPrice, premium: f.premium, ret1d: f.ret1d, retSeason: f.retSeason, vsSpy: f.vsSpy, reputation: f.reputation, top: [] }));
    const moves = await Promise.all(funds.items.map((f) => api.moves(f.id, 1)));
    funds.items.forEach((f, i) => (lastMoves[f.id] = moves[i]?.items?.[0] ?? null));
  } else {
    peers = chain.map((f) => ({
      id: f.id,
      nav: f.nav,
      coinPrice: f.coinPrice,
      premium: f.premiumPct,
      ret1d: null,
      retSeason: f.navSeasonStart && f.navSeasonStart > 0 ? Number(((f.nav / f.navSeasonStart - 1) * 100).toFixed(3)) : null,
      vsSpy: null,
      reputation: f.reputation,
      top: Object.entries(f.plan.weights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([asset, bps]) => ({ asset, bps })),
    }));
  }
  return {
    at: now.toISOString(),
    assets: views,
    spy: { price: assets?.benchmark?.price ?? (spyPts.length ? (spyPts[spyPts.length - 1] as PricePoint).c : null), change1d: assets?.benchmark?.change1d ?? spyR.ret1d },
    news: newsItems.slice(0, 30),
    funds: peers,
    lastMoves,
    priceSource,
  };
}

export function biggestMove(s: MarketSnapshot): number {
  return s.assets.reduce((m, a) => Math.max(m, Math.abs(a.ret1bell ?? 0)), 0);
}
