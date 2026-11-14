import type { Db } from "@listed/db";
import { assetByYahoo, FX_INR_SYMBOL, LISTED_SYMBOLS } from "@listed/fundmath";
import { BACKFILL_DAYS, fetchSymbol, needsBackfill, SOURCES, UPDATE_DAYS } from "../pulse/pulse";
import { priceCoverage, upsertBars } from "../store";

export interface DailyDeps {
  db: Db;
  timeoutMs: number;
  log: { warn(o: object, m: string): void };
  fetchImpl?: typeof fetch;
}

export async function runUniverseDaily(deps: DailyDeps): Promise<Record<string, unknown>> {
  const coverage = await priceCoverage(deps.db);
  const symbols = [...LISTED_SYMBOLS, FX_INR_SYMBOL];

  const ordered = [...SOURCES].sort((a, b) => ["yahoo", "nasdaq", "stooq"].indexOf(a.name) - ["yahoo", "nasdaq", "stooq"].indexOf(b.name));
  let written = 0;
  const failed: string[] = [];
  for (const symbol of symbols) {

    const asset = assetByYahoo(symbol);
    const usOnly = symbol.includes(".") || symbol.includes("=") || asset?.kind === "crypto";
    const id = asset?.id ?? symbol;
    const backfill = needsBackfill(coverage.get(id));
    const res = await fetchSymbol(symbol, backfill ? BACKFILL_DAYS : UPDATE_DAYS, {
      timeoutMs: deps.timeoutMs,
      fetchImpl: deps.fetchImpl,
      sources: usOnly ? ordered.filter((s) => s.name === "yahoo") : ordered,
    });
    if (res.bars.length) written += await upsertBars(deps.db, id === symbol ? res.bars : res.bars.map((b) => ({ ...b, symbol: id })));
    else {
      failed.push(symbol);
      for (const e of res.errors) deps.log.warn({ symbol, err: e }, "daily price source error");
    }
  }
  return { symbols: symbols.length, written, failed };
}
