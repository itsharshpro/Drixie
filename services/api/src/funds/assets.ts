import { dz, type Db } from "@listed/db";
import { assetById, BENCHMARK, UNIVERSE, type UniverseAsset } from "@listed/fundmath";
import { BASKET_LABELS, BASKETS, type Asset, type AssetDetail, type AssetsResponse, type FundsNewsItem, type Sourced } from "@listed/shared";
import { allFunds } from "./common";
import { changes1d, latestPrices, valuations, type PricePoint, type Valuation } from "./prices";

function toAsset(a: UniverseAsset, p: PricePoint | undefined, ch: number | undefined, v: Valuation | undefined, heldBy: { fund: string; bps: number }[]): Asset {
  const sources: Sourced[] = v?.sources ?? [];
  return {
    id: a.id,
    name: a.name,
    basket: a.basket,
    kind: a.kind,
    region: a.region,
    price: p?.usd ?? null,
    localPrice: p?.local ?? null,
    currency: a.currency,
    change1d: ch ?? null,
    estimated: a.kind === "startup",
    sources,
    updatedAt: p?.at ?? null,
    heldBy,
  };
}

async function holdersByAsset(db: Db): Promise<Map<string, { fund: string; bps: number }[]>> {
  const out = new Map<string, { fund: string; bps: number }[]>();
  for (const f of await allFunds(db)) {
    if (f.status === "liquidated") continue;
    for (const w of f.weights) {
      const a = out.get(w.asset) ?? [];
      a.push({ fund: f.id, bps: w.bps });
      out.set(w.asset, a);
    }
  }
  for (const a of out.values()) a.sort((x, y) => y.bps - x.bps);
  return out;
}

export async function listAssets(db: Db): Promise<AssetsResponse> {
  const [latest, vals, held] = await Promise.all([latestPrices(db), valuations(db), holdersByAsset(db)]);
  const ch = await changes1d(db, latest);
  const baskets = BASKETS.map((id) => ({
    id,
    label: BASKET_LABELS[id],
    assets: UNIVERSE.filter((a) => a.basket === id).map((a) => toAsset(a, latest.get(a.id), ch.get(a.id), vals.get(a.id), held.get(a.id) ?? [])),
  }));
  const spy = latest.get(BENCHMARK.id);
  const times = [...latest.values()].map((p) => p.at).sort();
  return {
    baskets,
    benchmark: { symbol: BENCHMARK.id, price: spy?.usd ?? null, change1d: ch.get(BENCHMARK.id) ?? null, updatedAt: spy?.at ?? null },
    updatedAt: times[times.length - 1] ?? null,
  };
}

export async function assetDetail(db: Db, id: string): Promise<AssetDetail | null> {
  const a = id === BENCHMARK.id ? BENCHMARK : assetById(id);
  if (!a) return null;
  const [latest, vals, held] = await Promise.all([latestPrices(db, [a.id]), valuations(db), holdersByAsset(db)]);
  const ch = await changes1d(db, latest);
  const v = vals.get(a.id);
  const base = toAsset(a, latest.get(a.id), ch.get(a.id), v, held.get(a.id) ?? []);
  const news = await db.execute<{ id: number; title: string; url: string; domain: string; published_at: Date; sentiment: number | null; reason: string | null; companies: string[] }>(dz.sql`
    SELECT id, title, url, domain, published_at, sentiment, reason, companies FROM world_news
    WHERE companies @> ARRAY[${a.id}]::text[] AND tag_status <> 'failed' ORDER BY published_at DESC LIMIT 20`);
  return {
    ...base,
    valuation: v && v.sources[0] ? { usd: v.usd, date: v.date, source: v.sources[0] } : null,
    news: news.map(
      (n): FundsNewsItem => ({
        id: String(n.id),
        title: n.title,
        url: n.url,
        domain: n.domain,
        publishedAt: new Date(n.published_at).toISOString(),
        sentiment: n.sentiment === null ? null : (Math.max(-2, Math.min(2, n.sentiment)) as FundsNewsItem["sentiment"]),
        reason: n.reason,
        tickers: n.companies,
      }),
    ),
  };
}
