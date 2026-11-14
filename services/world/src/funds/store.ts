import type { Sql } from "./schema";

export const iso = (d: Date): string => d.toISOString();

export interface AssetBarRow {
  asset: string;
  ts: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  currency: string;
  closeUsd: number;
  fx: number | null;
  source: string;
}

export async function upsertAssetBars(sql: Sql, rows: AssetBarRow[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      asset: r.asset,
      ts: iso(r.ts),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      currency: r.currency,
      close_usd: r.closeUsd,
      fx: r.fx,
      source: r.source,
    }));
    if (chunk.length === 0) continue;
    await sql`
      INSERT INTO asset_prices ${sql(chunk, "asset", "ts", "open", "high", "low", "close", "volume", "currency", "close_usd", "fx", "source")}
      ON CONFLICT (asset, ts) DO UPDATE SET open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
        volume = excluded.volume, currency = excluded.currency, close_usd = excluded.close_usd, fx = excluded.fx,
        source = excluded.source, fetched_at = now()`;
    n += chunk.length;
  }
  return n;
}

export async function upsertFx(sql: Sql, pair: string, rows: { ts: Date; rate: number; source: string }[]): Promise<number> {
  if (rows.length === 0) return 0;
  const chunk = rows.map((r) => ({ pair, ts: iso(r.ts), rate: r.rate, source: r.source }));
  await sql`
    INSERT INTO fx_rates ${sql(chunk, "pair", "ts", "rate", "source")}
    ON CONFLICT (pair, ts) DO UPDATE SET rate = excluded.rate, source = excluded.source, fetched_at = now()`;
  return chunk.length;
}

export async function fxSeries(sql: Sql, pair: string, since: Date): Promise<{ ts: Date; rate: number }[]> {
  const rows = await sql<{ ts: Date; rate: number }[]>`
    (SELECT ts, rate FROM fx_rates WHERE pair = ${pair} AND ts < ${iso(since)} ORDER BY ts DESC LIMIT 1)
    UNION ALL
    (SELECT ts, rate FROM fx_rates WHERE pair = ${pair} AND ts >= ${iso(since)} ORDER BY ts)`;
  return rows.map((r) => ({ ts: new Date(r.ts), rate: Number(r.rate) })).sort((a, b) => a.ts.getTime() - b.ts.getTime());
}

export function rateAt(series: { ts: Date; rate: number }[], ts: Date): number | null {
  if (series.length === 0) return null;
  let best: number | null = null;
  for (const p of series) {
    if (p.ts.getTime() <= ts.getTime()) best = p.rate;
    else break;
  }
  return best ?? series[0]?.rate ?? null;
}

export async function assetsWithRecentBars(sql: Sql, hours: number): Promise<Set<string>> {
  const rows = await sql<{ asset: string }[]>`
    SELECT DISTINCT asset FROM asset_prices WHERE ts >= now() - make_interval(hours => ${hours})`;
  return new Set(rows.map((r) => r.asset));
}

export interface LatestPrice {
  asset: string;
  ts: Date;
  close: number;
  closeUsd: number;
  currency: string;
  source: string;
}

export async function latestAssetPrices(sql: Sql, at: Date = new Date()): Promise<Map<string, LatestPrice>> {
  const rows = await sql<{ asset: string; ts: Date; close: number; close_usd: number; currency: string; source: string }[]>`
    SELECT DISTINCT ON (asset) asset, ts, close, close_usd, currency, source
    FROM asset_prices WHERE ts <= ${iso(at)} AND ts >= ${iso(new Date(at.getTime() - 10 * 86_400_000))}
    ORDER BY asset, ts DESC`;
  return new Map(
    rows.map((r) => [r.asset, { asset: r.asset, ts: new Date(r.ts), close: Number(r.close), closeUsd: Number(r.close_usd), currency: r.currency, source: r.source }]),
  );
}

export async function assetPriceCoverage(sql: Sql): Promise<{ assets: number; bars: number; latest: Date | null }> {
  const [r] = await sql<{ assets: number; bars: number; latest: Date | null }[]>`
    SELECT count(DISTINCT asset)::int AS assets, count(*)::int AS bars, max(ts) AS latest
    FROM asset_prices WHERE ts >= now() - interval '1 day'`;
  return { assets: r?.assets ?? 0, bars: r?.bars ?? 0, latest: r?.latest ? new Date(r.latest) : null };
}

export async function pruneOldBars(sql: Sql, days: number): Promise<number> {
  const res = await sql`DELETE FROM asset_prices WHERE ts < now() - make_interval(days => ${days})`;
  await sql`DELETE FROM fx_rates WHERE ts < now() - make_interval(days => ${days})`;
  return res.count;
}
