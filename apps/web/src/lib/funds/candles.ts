import type { FundCandle, FundCandleInterval } from "@listed/shared";
import type { Candle, CandleInterval } from "@/components/trading/candles";

export const FUND_INTERVALS: readonly FundCandleInterval[] = ["5m", "15m", "1h", "1d"];
export const FUND_INTERVAL_LABEL: Record<FundCandleInterval, string> = { "5m": "5m", "15m": "15m", "1h": "1h", "1d": "1d" };
export const FUND_INTERVAL_WORDS: Record<FundCandleInterval, string> = {
  "5m": "5-minute",
  "15m": "15-minute",
  "1h": "hourly",
  "1d": "daily",
};

export function chartInterval(i: FundCandleInterval): CandleInterval {
  return i === "1d" ? "1D" : i === "1h" ? "1h" : "5m";
}

export function toCandles(rows: readonly FundCandle[] | null | undefined): Candle[] {
  if (!rows?.length) return [];
  const out: Candle[] = [];
  for (const r of rows) {
    const time = Math.floor(Date.parse(r.t) / 1000);
    if (!Number.isFinite(time) || !Number.isFinite(r.c)) continue;
    out.push({ time, open: r.o, high: Math.max(r.h, r.o, r.c), low: Math.min(r.l, r.o, r.c), close: r.c, volume: r.v ?? 0 });
  }
  out.sort((a, b) => a.time - b.time);

  const dedup: Candle[] = [];
  for (const c of out) {
    if (dedup.length && dedup[dedup.length - 1]!.time === c.time) dedup[dedup.length - 1] = c;
    else dedup.push(c);
  }
  return dedup;
}

export function candlesChange(c: readonly Candle[]): number | null {
  if (c.length < 1) return null;
  const first = c[0]!.open;
  const last = c[c.length - 1]!.close;
  return first > 0 ? (last / first - 1) * 100 : null;
}

export function rangeLabel(c: readonly Candle[]): string | undefined {
  if (c.length < 2) return undefined;
  const secs = c[c.length - 1]!.time - c[0]!.time;
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))}m`;
  if (secs < 2 * 86400) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}d`;
}
