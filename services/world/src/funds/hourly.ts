import { assetByYahoo, BACKTEST_START, FX_INR_SYMBOL, LISTED_SYMBOLS, STARTUP_IDS } from "@listed/fundmath";
import { fetchText } from "../http";
import { parseYahooIntraday, type IntradayBar } from "./intraday";
import type { Sql } from "./schema";
import { iso } from "./store";

const HOUR = 3_600_000;

const FETCH_FROM_MS = Date.parse(BACKTEST_START) - 2 * 86_400_000;

export interface HourlyDeps {
  sql: Sql;
  timeoutMs: number;
  log: { warn(o: object, m: string): void; info(o: object, m: string): void };
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export const yahooHourlyUrl = (host: string, symbol: string, fromMs: number, toMs: number): string =>
  `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&period1=${Math.floor(fromMs / 1000)}&period2=${Math.ceil(toMs / 1000)}&includePrePost=false`;

export async function fetchHourly(
  symbol: string,
  fromMs: number,
  toMs: number,
  deps: Pick<HourlyDeps, "timeoutMs" | "fetchImpl" | "sleep">,
): Promise<{ bars: IntradayBar[]; currency: string | null; source: string | null; errors: string[] }> {
  const errors: string[] = [];
  for (const [name, host] of [["yahoo", "query1.finance.yahoo.com"], ["yahoo2", "query2.finance.yahoo.com"]] as const) {
    try {
      const res = await fetchText(yahooHourlyUrl(host, symbol, fromMs, toMs), {
        timeoutMs: deps.timeoutMs,
        retries: 1,
        backoffMs: 2_000,
        minSpacingMs: 400,
        headers: { accept: "application/json" },
        fetchImpl: deps.fetchImpl,
        sleep: deps.sleep,
      });
      const { bars, currency } = parseYahooIntraday(symbol, res.text);
      if (bars.length === 0) throw new Error(`no hourly bars for ${symbol}`);
      return { bars, currency, source: `${name}-1h`, errors };
    } catch (err) {
      errors.push(`${name} ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { bars: [], currency: null, source: null, errors };
}

export function inrRateAt(fx: readonly { t: number; rate: number }[], t: number): number | null {
  let best: number | null = null;
  for (const p of fx) {
    if (p.t <= t) best = p.rate;
    else break;
  }
  return best ?? fx[0]?.rate ?? null;
}

interface HourRow {
  asset: string;
  ts: string;
  open_usd: number | null;
  high_usd: number | null;
  low_usd: number | null;
  close_usd: number;
  close: number;
  currency: string;
  fx: number | null;
  source: string;
}

export function toHourRows(asset: string, bars: readonly IntradayBar[], currency: string, source: string, fx: readonly { t: number; rate: number }[]): HourRow[] {
  const rows: HourRow[] = [];
  for (const b of bars) {
    const rate = currency === "INR" ? inrRateAt(fx, b.ts.getTime()) : 1;
    if (!rate) continue;
    const usd = (v: number | null) => (v === null ? null : v / rate);
    rows.push({
      asset,
      ts: iso(b.ts),
      open_usd: usd(b.open),
      high_usd: usd(b.high),
      low_usd: usd(b.low),
      close_usd: b.close / rate,
      close: b.close,
      currency,
      fx: currency === "INR" ? rate : null,
      source,
    });
  }
  return rows;
}

async function upsertHourRows(sql: Sql, rows: HourRow[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (chunk.length === 0) continue;
    await sql`
      INSERT INTO asset_bars_1h ${sql(chunk, "asset", "ts", "open_usd", "high_usd", "low_usd", "close_usd", "close", "currency", "fx", "source")}
      ON CONFLICT (asset, ts) DO UPDATE SET
        open_usd = excluded.open_usd, high_usd = excluded.high_usd, low_usd = excluded.low_usd, close_usd = excluded.close_usd,
        close = excluded.close, currency = excluded.currency, fx = excluded.fx, source = excluded.source, fetched_at = now()`;
    n += chunk.length;
  }
  return n;
}

export async function runHourlyBars(deps: HourlyDeps): Promise<Record<string, unknown>> {
  const now = (deps.now?.() ?? new Date()).getTime();
  const lastRows = await deps.sql<{ asset: string; last: string }[]>`SELECT asset, max(ts)::text AS last FROM asset_bars_1h GROUP BY asset`;
  const lastOf = new Map(lastRows.map((r) => [r.asset, Date.parse(r.last)]));
  const fromFor = (asset: string): number => {
    const last = lastOf.get(asset);
    return last ? Math.max(FETCH_FROM_MS, last - 3 * 86_400_000) : FETCH_FROM_MS;
  };

  const fxRes = await fetchHourly(FX_INR_SYMBOL, FETCH_FROM_MS, now, deps);
  for (const e of fxRes.errors) deps.log.warn({ err: e }, "hourly fx source error");
  const fx = fxRes.bars.map((b) => ({ t: b.ts.getTime(), rate: b.close })).filter((p) => p.rate > 0);

  let written = 0;
  const failed: string[] = [];
  for (const symbol of LISTED_SYMBOLS) {
    const asset = assetByYahoo(symbol);
    if (!asset) continue;
    const res = await fetchHourly(symbol, fromFor(asset.id), now, deps);
    if (res.bars.length === 0) {
      failed.push(symbol);
      for (const e of res.errors) deps.log.warn({ symbol, err: e }, "hourly price source error");
      continue;
    }
    const currency = (res.currency ?? asset.currency).toUpperCase() === "INR" ? "INR" : "USD";
    if (currency === "INR" && fx.length === 0) {
      failed.push(symbol);
      continue;
    }
    written += await upsertHourRows(deps.sql, toHourRows(asset.id, res.bars, currency, res.source ?? "yahoo-1h", fx));
  }

  const marks = await deps.sql<{ asset: string; date: string; mark: number }[]>`
    SELECT asset, date::text AS date, mark FROM startup_marks
    WHERE asset = ANY(${STARTUP_IDS as string[]}) AND date >= ${BACKTEST_START.slice(0, 10)}::date - 2`;
  const markRows: HourRow[] = marks.map((m) => ({
    asset: m.asset,
    ts: iso(new Date(`${m.date}T00:00:00Z`)),
    open_usd: Number(m.mark),
    high_usd: Number(m.mark),
    low_usd: Number(m.mark),
    close_usd: Number(m.mark),
    close: Number(m.mark),
    currency: "USD",
    fx: null,
    source: "estimated-mark",
  }));
  written += await upsertHourRows(deps.sql, markRows);

  if (failed.length === LISTED_SYMBOLS.length) throw new Error("no hourly price source answered for any universe symbol");
  return { written, symbols: LISTED_SYMBOLS.length - failed.length, failed, fxBars: fx.length, startupMarks: markRows.length, hourMs: HOUR };
}
