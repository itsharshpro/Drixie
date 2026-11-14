import type { PricePoint } from "@listed/shared";
import { formatClock, formatDateTime, formatDay } from "../../lib/format";

export type CandleInterval = "1m" | "5m" | "1h" | "1D";
export const CANDLE_INTERVALS: readonly CandleInterval[] = ["1m", "5m", "1h", "1D"];

export const INTERVAL_SECONDS: Record<CandleInterval, number> = { "1m": 60, "5m": 300, "1h": 3600, "1D": 86400 };

export const INTERVAL_LABEL: Record<CandleInterval, string> = {
  "1m": "1-minute",
  "5m": "5-minute",
  "1h": "1-hour",
  "1D": "1-day",
};

export type SourceRange = "1H" | "1D" | "1W" | "1M" | "ALL";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;

  volume: number;
}

export const MAX_CANDLES = 600;

export const bucketStart = (seconds: number, intervalSec: number): number => Math.floor(seconds / intervalSec) * intervalSec;

export interface AggregateOptions {

  carryOpen?: boolean;

  limit?: number;
}

export function aggregateCandles(points: readonly PricePoint[], intervalSec: number, opts: AggregateOptions = {}): Candle[] {
  const carryOpen = opts.carryOpen ?? true;
  const rows = points
    .map((p, i) => ({ s: Date.parse(p.t) / 1000, price: p.price, volume: p.volume, i }))
    .filter((r) => Number.isFinite(r.s) && Number.isFinite(r.price) && r.price > 0)

    .sort((a, b) => a.s - b.s || a.i - b.i);

  const out: Candle[] = [];
  for (const r of rows) {
    const time = bucketStart(r.s, intervalSec);
    const vol = Number.isFinite(r.volume) && r.volume > 0 ? r.volume : 0;
    const cur = out[out.length - 1];
    if (cur && cur.time === time) {
      cur.high = Math.max(cur.high, r.price);
      cur.low = Math.min(cur.low, r.price);
      cur.close = r.price;
      cur.volume += vol;
      continue;
    }
    const open = carryOpen && cur ? cur.close : r.price;
    out.push({ time, open, high: Math.max(open, r.price), low: Math.min(open, r.price), close: r.price, volume: vol });
  }
  const limit = opts.limit ?? MAX_CANDLES;
  return out.length > limit ? out.slice(out.length - limit) : out;
}

export function applyTickToCandles(candles: readonly Candle[], price: number, atMs: number, intervalSec: number, limit = MAX_CANDLES): Candle[] {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(atMs)) return candles as Candle[];
  const time = bucketStart(atMs / 1000, intervalSec);
  const last = candles[candles.length - 1];
  if (!last) return [{ time, open: price, high: price, low: price, close: price, volume: 0 }];
  if (time <= last.time) {
    const next = { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) };
    return [...candles.slice(0, -1), next];
  }
  const opened: Candle = { time, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: 0 };
  const out = [...candles, opened];
  return out.length > limit ? out.slice(out.length - limit) : out;
}

export function seriesChange(candles: readonly Candle[]): number | null {
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last || !(first.open > 0)) return null;
  return ((last.close - first.open) / first.open) * 100;
}

export function candleChange(c: Candle): number | null {
  return c.open > 0 ? ((c.close - c.open) / c.open) * 100 : null;
}

export const isUp = (c: Candle): boolean => c.close >= c.open;

export function timeframeLabel(option: string): string {
  const months = /^(\d+)M$/.exec(option);
  if (months) return `${months[1]}mo`;
  return option.toLowerCase();
}

export const isDoji = (c: Candle): boolean => Math.abs(c.close - c.open) <= Math.max(Math.abs(c.open), Math.abs(c.close)) * 1e-9;

export function priceExtent(candles: readonly Candle[]): { lo: number; hi: number } | null {
  if (!candles.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  if (hi - lo <= Math.abs(hi) * 1e-9) {
    const pad = Math.abs(hi) * 0.01 || 1e-6;
    return { lo: lo - pad, hi: hi + pad };
  }
  return { lo, hi };
}

const RESOLUTIONS = [86_400, 21_600, 3_600, 900, 60] as const;

export function inferResolution(points: readonly PricePoint[]): number | null {
  const aligned = points.map((p) => Date.parse(p.t)).filter((ms) => Number.isFinite(ms) && ms % 60_000 === 0);
  if (!aligned.length) return null;
  for (const r of RESOLUTIONS) if (aligned.every((ms) => (ms / 1000) % r === 0)) return r;
  return null;
}

export const FALLBACK_RANGE: Record<CandleInterval, SourceRange> = { "1m": "1H", "5m": "1H", "1h": "1W", "1D": "1M" };

export type ChartFetcher = (ticker: string, range: SourceRange) => Promise<PricePoint[]>;

export async function candlesFromChart(ticker: string, interval: CandleInterval, fetchChart: ChartFetcher): Promise<Candle[]> {
  const sec = INTERVAL_SECONDS[interval];
  const all = await fetchChart(ticker, "ALL");
  if (!all.length) return [];
  const res = inferResolution(all);
  if (res === null || res <= sec) return aggregateCandles(all, sec);
  const finer = await fetchChart(ticker, FALLBACK_RANGE[interval]);
  return aggregateCandles(finer.length ? finer : all, sec);
}

export type CandleIntervalChoice = CandleInterval | "auto";

export interface CandleSeries {
  interval: CandleInterval;
  candles: Candle[];
}

export function pickInterval(points: readonly PricePoint[], target = 24): CandleInterval {
  const res = inferResolution(points) ?? 60;
  const options = CANDLE_INTERVALS.filter((i) => INTERVAL_SECONDS[i] >= res);
  if (!options.length) return "1D";
  const counts = options.map((i) => ({ i, n: aggregateCandles(points, INTERVAL_SECONDS[i]).length }));
  const filling = counts.filter((c) => c.n >= target);
  if (filling.length) return filling[filling.length - 1].i;
  return counts.reduce((best, c) => (c.n > best.n ? c : best)).i;
}

export async function seriesFromChart(ticker: string, interval: CandleIntervalChoice, fetchChart: ChartFetcher, target = 24): Promise<CandleSeries> {
  if (interval !== "auto") return { interval, candles: await candlesFromChart(ticker, interval, fetchChart) };
  const all = await fetchChart(ticker, "ALL");
  const chosen = pickInterval(all, target);
  return { interval: chosen, candles: aggregateCandles(all, INTERVAL_SECONDS[chosen]) };
}

export interface ServerCandle {
  t: string; // ISO bucket start
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function fromServerCandles(rows: readonly ServerCandle[], limit = MAX_CANDLES): Candle[] {
  const out = rows
    .map((r) => ({
      time: Math.floor(Date.parse(r.t) / 1000),
      open: r.open,
      high: Math.max(r.high, r.open, r.close),
      low: Math.min(r.low, r.open, r.close),
      close: r.close,
      volume: Number.isFinite(r.volume) && r.volume > 0 ? r.volume : 0,
    }))
    .filter((c) => Number.isFinite(c.time) && c.open > 0 && c.close > 0)
    .sort((a, b) => a.time - b.time);
  return out.length > limit ? out.slice(out.length - limit) : out;
}

export function formatCandleTime(time: number, interval: CandleInterval = "5m"): string {
  const d = new Date(time * 1000);
  if (interval === "1D") return formatDay(d);
  if (interval === "1h") return formatDateTime(d);
  return formatClock(d);
}

export function spanLabel(candles: readonly Candle[], intervalSec: number): string | null {
  if (!candles.length) return null;
  const sec = candles[candles.length - 1].time - candles[0].time + intervalSec;
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86_400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86_400)}d`;
}
