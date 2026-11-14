import { dz, type Db } from "@listed/db";
import { assetById, BENCHMARK, UNIVERSE } from "@listed/fundmath";
import type { FundCandle, FundCandleInterval, Sourced } from "@listed/shared";
import { tableExists, pgArray } from "./common";

export interface PricePoint {
  usd: number;
  local: number | null;
  currency: string;
  at: string;
  source: string;
}

const isStartupMark = (id: string) => assetById(id)?.kind === "startup";

export async function latestPrices(db: Db, ids?: string[]): Promise<Map<string, PricePoint>> {
  const out = new Map<string, PricePoint>();
  const listed = (ids ?? [...UNIVERSE.map((a) => a.id), BENCHMARK.id]).filter((id) => !isStartupMark(id));
  const startups = (ids ?? UNIVERSE.map((a) => a.id)).filter(isStartupMark);
  if (listed.length && (await tableExists(db, "asset_prices"))) {
    const rows = await db.execute<{ asset: string; close_usd: number; close: number; currency: string; ts: Date; source: string }>(dz.sql`
      SELECT DISTINCT ON (asset) asset, close_usd, close, currency, ts, source FROM asset_prices
      WHERE asset = ANY(${pgArray(listed)}::text[]) ORDER BY asset, ts DESC`);
    for (const r of rows)
      out.set(r.asset, {
        usd: Number(r.close_usd),
        local: r.currency !== "USD" ? Number(r.close) : null,
        currency: r.currency,
        at: new Date(r.ts).toISOString(),
        source: r.source,
      });
  }
  if (startups.length && (await tableExists(db, "startup_marks"))) {
    const rows = await db.execute<{ asset: string; mark: number; date: string; updated_at: Date }>(dz.sql`
      SELECT DISTINCT ON (asset) asset, mark, date::text AS date, updated_at FROM startup_marks
      WHERE asset = ANY(${pgArray(startups)}::text[]) ORDER BY asset, date DESC`);
    for (const r of rows) out.set(r.asset, { usd: Number(r.mark), local: null, currency: "USD", at: new Date(r.updated_at).toISOString(), source: "mark" });
  }
  return out;
}

export async function pricesAt(db: Db, ids: string[], at: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const listed = ids.filter((id) => !isStartupMark(id));
  const startups = ids.filter(isStartupMark);
  if (listed.length && (await tableExists(db, "asset_prices"))) {
    const rows = await db.execute<{ asset: string; p: number }>(dz.sql`
      SELECT DISTINCT ON (asset) asset, close_usd AS p FROM asset_prices
      WHERE asset = ANY(${pgArray(listed)}::text[]) AND ts <= ${at.toISOString()}::timestamptz ORDER BY asset, ts DESC`);
    for (const r of rows) out.set(r.asset, Number(r.p));
  }
  if (startups.length && (await tableExists(db, "startup_marks"))) {
    const rows = await db.execute<{ asset: string; p: number }>(dz.sql`
      SELECT DISTINCT ON (asset) asset, mark AS p FROM startup_marks
      WHERE asset = ANY(${pgArray(startups)}::text[]) AND date <= ${at.toISOString().slice(0, 10)}::date ORDER BY asset, date DESC`);
    for (const r of rows) out.set(r.asset, Number(r.p));
  }
  return out;
}

export async function changes1d(db: Db, latest: Map<string, PricePoint>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const listed = [...latest.keys()].filter((id) => !isStartupMark(id));
  if (listed.length && (await tableExists(db, "asset_prices"))) {
    const rows = await db.execute<{ asset: string; p: number }>(dz.sql`
      SELECT DISTINCT ON (a.asset) a.asset, a.close_usd AS p FROM asset_prices a
      JOIN (SELECT asset, max(ts) AS last FROM asset_prices WHERE asset = ANY(${pgArray(listed)}::text[]) GROUP BY asset) m ON m.asset = a.asset
      WHERE a.ts <= m.last - interval '20 hours' ORDER BY a.asset, a.ts DESC`);
    for (const r of rows) {
      const now = latest.get(r.asset)?.usd;
      if (now && Number(r.p) > 0) out.set(r.asset, Math.round((now / Number(r.p) - 1) * 10000) / 100);
    }

    const missing = listed.filter((id) => !out.has(id));
    if (missing.length) {
      const d = await db.execute<{ symbol: string; close: number }>(dz.sql`
        SELECT symbol, close FROM (
          SELECT symbol, close, row_number() OVER (PARTITION BY symbol ORDER BY date DESC) rn FROM world_prices WHERE symbol = ANY(${pgArray(missing)}::text[])
        ) x WHERE rn = 2`);
      for (const r of d) {
        const now = latest.get(r.symbol);
        if (now && Number(r.close) > 0 && now.currency === "USD") out.set(r.symbol, Math.round((now.usd / Number(r.close) - 1) * 10000) / 100);
      }
    }
  }
  const startups = [...latest.keys()].filter(isStartupMark);
  if (startups.length && (await tableExists(db, "startup_marks"))) {
    const rows = await db.execute<{ asset: string; mark: number; prev_mark: number }>(dz.sql`
      SELECT DISTINCT ON (asset) asset, mark, prev_mark FROM startup_marks WHERE asset = ANY(${pgArray(startups)}::text[]) ORDER BY asset, date DESC`);
    for (const r of rows) if (Number(r.prev_mark) > 0) out.set(r.asset, Math.round((Number(r.mark) / Number(r.prev_mark) - 1) * 10000) / 100);
  }
  return out;
}

export interface Valuation {
  usd: number;
  date: string;
  label: string;
  sources: Sourced[];
}

function sourcesOf(v: unknown): Sourced[] {
  if (!Array.isArray(v)) return [];
  const out: Sourced[] = [];
  for (const s of v) {
    if (typeof s === "string") out.push({ label: hostOf(s), url: s });
    else if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url : null;
      if (url) out.push({ label: typeof o.label === "string" ? o.label : typeof o.title === "string" ? o.title : hostOf(url), url });
    }
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function valuations(db: Db): Promise<Map<string, Valuation>> {
  const out = new Map<string, Valuation>();
  if (!(await tableExists(db, "startup_rounds"))) return out;
  const rows = await db.execute<{ asset: string; round_date: string; valuation_usd: number; label: string; sources: unknown }>(dz.sql`
    SELECT DISTINCT ON (asset) asset, round_date::text AS round_date, valuation_usd, label, sources FROM startup_rounds
    ORDER BY asset, round_date DESC, id DESC`);
  for (const r of rows) out.set(r.asset, { usd: Number(r.valuation_usd), date: r.round_date, label: r.label, sources: sourcesOf(r.sources) });
  return out;
}

const BIN: Record<FundCandleInterval, string> = { "5m": "5 minutes", "15m": "15 minutes", "1h": "1 hour", "1d": "1 day" };

export async function assetCandles(db: Db, id: string, interval: FundCandleInterval, limit: number): Promise<FundCandle[]> {
  if (isStartupMark(id)) {
    if (!(await tableExists(db, "startup_marks"))) return [];
    const rows = await db.execute<{ date: string; mark: number; prev_mark: number }>(dz.sql`
      SELECT date::text AS date, mark, prev_mark FROM startup_marks WHERE asset = ${id} ORDER BY date DESC LIMIT ${limit}`);
    return rows
      .reverse()
      .map((r) => ({ t: `${r.date}T00:00:00.000Z`, o: Number(r.prev_mark), h: Math.max(Number(r.prev_mark), Number(r.mark)), l: Math.min(Number(r.prev_mark), Number(r.mark)), c: Number(r.mark), v: 0 }));
  }
  if (!(await tableExists(db, "asset_prices"))) return [];

  const rows = await db.execute<{ t: Date; o: number; h: number; l: number; c: number; v: number | null }>(dz.sql`
    SELECT b AS t,
      (array_agg(COALESCE(open, close) * close_usd / close ORDER BY ts ASC))[1] AS o,
      max(COALESCE(high, close) * close_usd / close) AS h,
      min(COALESCE(low, close) * close_usd / close) AS l,
      (array_agg(close_usd ORDER BY ts DESC))[1] AS c,
      sum(volume) AS v
    FROM (SELECT *, date_bin(${BIN[interval]}::interval, ts, TIMESTAMPTZ '2000-01-01') AS b FROM asset_prices WHERE asset = ${id}) x
    GROUP BY b ORDER BY b DESC LIMIT ${limit}`);
  return rows.reverse().map((r) => ({ t: new Date(r.t).toISOString(), o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: Number(r.v ?? 0) }));
}
