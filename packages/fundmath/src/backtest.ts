export interface PriceBar {

  t: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number;
}

export interface BacktestCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface BacktestPoint {
  t: number;
  v: number;
}

export interface BasketWeight {
  asset: string;
  bps: number;
}

export const BACKTEST_START = "2026-11-01T00:00:00Z";
export const BACKTEST_LABEL = "Backtest · real prices since Nov 1";
export const BACKTEST_BASE_USD = 10;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const MANDATE_BASKETS: Readonly<Record<string, readonly BasketWeight[]>> = {

  atlas: [
    { asset: "JPM", bps: 1200 },
    { asset: "BRK-B", bps: 1200 },
    { asset: "V", bps: 600 },
    { asset: "MSFT", bps: 1000 },
    { asset: "AAPL", bps: 800 },
    { asset: "JNJ", bps: 1000 },
    { asset: "KO", bps: 1000 },
    { asset: "COST", bps: 800 },
    { asset: "XOM", bps: 1000 },
    { asset: "HDFCBANK.NS", bps: 1400 },
  ],

  meridian: [
    { asset: "NVDA", bps: 1300 },
    { asset: "MSFT", bps: 1100 },
    { asset: "AAPL", bps: 900 },
    { asset: "AMZN", bps: 900 },
    { asset: "JPM", bps: 1000 },
    { asset: "V", bps: 900 },
    { asset: "LLY", bps: 1300 },
    { asset: "COST", bps: 1200 },
    { asset: "RELIANCE.NS", bps: 800 },
    { asset: "BTC", bps: 600 },
  ],

  nova: [
    { asset: "NVDA", bps: 2000 },
    { asset: "AVGO", bps: 1000 },
    { asset: "TSM", bps: 800 },
    { asset: "AMD", bps: 700 },
    { asset: "MSFT", bps: 1200 },
    { asset: "META", bps: 1200 },
    { asset: "GOOGL", bps: 800 },
    { asset: "SPCX", bps: 800 },
    { asset: "databricks", bps: 700 },
    { asset: "BTC", bps: 800 },
  ],

  orion: [
    { asset: "UNH", bps: 1200 },
    { asset: "PFE", bps: 1100 },
    { asset: "NKE", bps: 1100 },
    { asset: "CVX", bps: 1000 },
    { asset: "NEE", bps: 900 },
    { asset: "INFY.NS", bps: 1000 },
    { asset: "ITC.NS", bps: 900 },
    { asset: "ASML", bps: 1000 },
    { asset: "AMZN", bps: 1000 },
    { asset: "ETH", bps: 800 },
  ],

  kite: [
    { asset: "TSLA", bps: 1500 },
    { asset: "NVDA", bps: 1200 },
    { asset: "AMD", bps: 1000 },
    { asset: "META", bps: 1000 },
    { asset: "SPCX", bps: 1200 },
    { asset: "stripe", bps: 800 },
    { asset: "perplexity", bps: 700 },
    { asset: "SOL", bps: 1000 },
    { asset: "BTC", bps: 900 },
    { asset: "NEAR", bps: 700 },
  ],
};

export const mandateBasket = (fundId: string): readonly BasketWeight[] | null => MANDATE_BASKETS[fundId] ?? null;

const pos = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const hourOf = (t: number): number => Math.floor(t / HOUR) * HOUR;
const r4 = (v: number): number => Math.round(v * 10_000) / 10_000;

function byHour(bars: readonly PriceBar[]): Map<number, PriceBar> {
  const out = new Map<number, PriceBar>();
  for (const b of [...bars].sort((a, z) => a.t - z.t)) {
    if (!pos(b.c)) continue;
    const t = hourOf(b.t);
    const prev = out.get(t);
    const h = pos(b.h) ? Math.max(b.h, b.c) : b.c;
    const l = pos(b.l) ? Math.min(b.l, b.c) : b.c;
    if (!prev) out.set(t, { t, o: pos(b.o) ? b.o : b.c, h, l, c: b.c });
    else out.set(t, { t, o: prev.o, h: Math.max(prev.h ?? prev.c, h), l: Math.min(prev.l ?? prev.c, l), c: b.c });
  }
  return out;
}

export interface BacktestResult {
  candles: BacktestCandle[];
  spy: BacktestPoint[];
}

export function backtest(
  weights: readonly BasketWeight[],
  bars: ReadonlyMap<string, readonly PriceBar[]>,
  startMs: number,
  opts: { endMs?: number; spy?: readonly PriceBar[] } = {},
): BacktestResult {
  const endMs = opts.endMs ?? Date.now();
  const held = weights.filter((w) => w.bps > 0);
  const cash = Math.max(0, 10_000 - held.reduce((s, w) => s + w.bps, 0)) / 10_000;

  interface Leg {
    w: number;
    hours: Map<number, PriceBar>;
    p0: number | null;
    last: number | null;
  }
  const legs: Leg[] = held.map((w) => {
    const series = [...(bars.get(w.asset) ?? [])].filter((b) => pos(b.c)).sort((a, z) => a.t - z.t);

    const before = series.filter((b) => b.t < startMs).at(-1);
    const after = series.find((b) => b.t >= startMs);
    const p0 = before ? before.c : after ? (pos(after.o) ? after.o : after.c) : null;
    return { w: w.bps / 10_000, hours: byHour(series.filter((b) => b.t >= startMs && b.t <= endMs)), p0, last: p0 };
  });
  const spySeries = [...(opts.spy ?? [])].filter((b) => pos(b.c)).sort((a, z) => a.t - z.t);
  const spyBefore = spySeries.filter((b) => b.t < startMs).at(-1);
  const spyAfter = spySeries.find((b) => b.t >= startMs);
  const spy0 = spyBefore ? spyBefore.c : spyAfter ? (pos(spyAfter.o) ? spyAfter.o : spyAfter.c) : null;
  const spyHours = byHour(spySeries.filter((b) => b.t >= startMs && b.t <= endMs));
  let spyLast = spy0;

  const hours = new Set<number>();
  for (const leg of legs) for (const t of leg.hours.keys()) hours.add(t);
  const candles: BacktestCandle[] = [];
  const spy: BacktestPoint[] = [];
  for (const t of [...hours].sort((a, z) => a - z)) {
    let o = cash;
    let h = cash;
    let l = cash;
    let c = cash;
    for (const leg of legs) {
      if (!leg.p0) {

        o += leg.w;
        h += leg.w;
        l += leg.w;
        c += leg.w;
        continue;
      }
      const bar = leg.hours.get(t);
      const prev = leg.last ?? leg.p0;
      const bo = bar ? (pos(bar.o) ? bar.o : prev) : prev;
      const bc = bar ? bar.c : prev;
      const bh = bar ? Math.max(bar.h ?? bc, bo, bc) : prev;
      const bl = bar ? Math.min(bar.l ?? bc, bo, bc) : prev;
      o += (leg.w * bo) / leg.p0;
      h += (leg.w * bh) / leg.p0;
      l += (leg.w * bl) / leg.p0;
      c += (leg.w * bc) / leg.p0;
      if (bar) leg.last = bar.c;
    }
    const k = BACKTEST_BASE_USD;
    candles.push({ t, o: r4(o * k), h: r4(Math.max(h, o, c) * k), l: r4(Math.min(l, o, c) * k), c: r4(c * k) });
    const sb = spyHours.get(t);
    if (sb) spyLast = sb.c;
    if (spy0 && spyLast) spy.push({ t, v: r4((spyLast / spy0) * k) });
  }
  return { candles, spy };
}

export function toDaily(result: BacktestResult): BacktestResult {
  const candles: BacktestCandle[] = [];
  for (const c of result.candles) {
    const t = Math.floor(c.t / DAY) * DAY;
    const cur = candles.at(-1);
    if (cur && cur.t === t) {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
    } else candles.push({ t, o: c.o, h: c.h, l: c.l, c: c.c });
  }
  const spy: BacktestPoint[] = [];
  for (const p of result.spy) {
    const t = Math.floor(p.t / DAY) * DAY;
    const cur = spy.at(-1);
    if (cur && cur.t === t) cur.v = p.v;
    else spy.push({ t, v: p.v });
  }
  return { candles, spy };
}
