import { assetByYahoo, FX_INR_SYMBOL, LISTED_SYMBOLS } from "@listed/fundmath";
import { fetchIntraday, type IntradayBar } from "./intraday";
import type { Sql } from "./schema";
import { updateStartupMarks } from "./startups";
import { assetsWithRecentBars, fxSeries, pruneOldBars, rateAt, upsertAssetBars, upsertFx, type AssetBarRow } from "./store";

export const FX_PAIR = "USDINR";

export const BAR_RETENTION_DAYS = 30;

export interface PricesDeps {
  sql: Sql;
  timeoutMs: number;
  log: { warn(o: object, m: string): void; info(o: object, m: string): void };
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

let lastPruneDay = "";

function toRows(asset: string, bars: IntradayBar[], currency: string, source: string, fx: { ts: Date; rate: number }[]): { rows: AssetBarRow[]; noFx: number } {
  const rows: AssetBarRow[] = [];
  let noFx = 0;
  for (const b of bars) {
    if (currency === "INR") {
      const rate = rateAt(fx, b.ts);
      if (!rate) {
        noFx += 1;
        continue;
      }
      rows.push({ asset, ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, currency, closeUsd: b.close / rate, fx: rate, source });
    } else {
      rows.push({ asset, ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, currency, closeUsd: b.close, fx: null, source });
    }
  }
  return { rows, noFx };
}

export async function runFundPrices(deps: PricesDeps): Promise<Record<string, unknown>> {
  const now = deps.now?.() ?? new Date();
  const recent = await assetsWithRecentBars(deps.sql, 72);
  const opts = { timeoutMs: deps.timeoutMs, fetchImpl: deps.fetchImpl, sleep: deps.sleep };

  const fxRecent = (await fxSeries(deps.sql, FX_PAIR, new Date(now.getTime() - 86_400_000))).length > 1;
  const fxFetch = await fetchIntraday(FX_INR_SYMBOL, { ...opts, range: fxRecent ? "1d" : "5d", dailyFallback: false });
  for (const e of fxFetch.errors) deps.log.warn({ err: e }, "fx source error");
  const fxWritten = await upsertFx(
    deps.sql,
    FX_PAIR,
    fxFetch.bars.map((b) => ({ ts: b.ts, rate: b.close, source: fxFetch.source ?? "yahoo" })),
  );
  const fx = await fxSeries(deps.sql, FX_PAIR, new Date(now.getTime() - 6 * 86_400_000));

  let written = 0;
  const failed: string[] = [];
  const sources: Record<string, number> = {};
  for (const symbol of LISTED_SYMBOLS) {
    const asset = assetByYahoo(symbol);
    if (!asset) continue;

    const crypto = asset.kind === "crypto";
    const res = await fetchIntraday(symbol, { ...opts, range: recent.has(asset.id) ? "1d" : "5d", ...(crypto ? { dailyFallback: false } : {}) });
    if (res.bars.length === 0) {
      failed.push(symbol);
      for (const e of res.errors) deps.log.warn({ symbol, err: e }, "price source error");
      continue;
    }
    const currency = (res.currency ?? asset.currency).toUpperCase() === "INR" ? "INR" : "USD";
    const { rows, noFx } = toRows(asset.id, res.bars, currency, res.source ?? "yahoo", fx);
    if (noFx > 0) deps.log.warn({ symbol, bars: noFx }, "no INR→USD rate yet; India bars skipped");
    written += await upsertAssetBars(deps.sql, rows);
    sources[res.source ?? "?"] = (sources[res.source ?? "?"] ?? 0) + 1;
  }
  if (failed.length === LISTED_SYMBOLS.length) throw new Error("no price source answered for any universe symbol");

  const marks = await updateStartupMarks(deps.sql, now);

  const day = now.toISOString().slice(0, 10);
  let pruned = 0;
  if (lastPruneDay !== day) {
    pruned = await pruneOldBars(deps.sql, BAR_RETENTION_DAYS);
    lastPruneDay = day;
  }
  return {
    fx: { source: fxFetch.source, written: fxWritten, rate: fx.at(-1)?.rate ?? null },
    symbols: LISTED_SYMBOLS.length,
    written,
    failed,
    sources,
    startups: Object.fromEntries(marks.map((m) => [m.asset, { mark: m.mark, newsBps: m.newsBps, headlines: m.headlines }])),
    ...(pruned ? { prunedBars: pruned } : {}),
  };
}
