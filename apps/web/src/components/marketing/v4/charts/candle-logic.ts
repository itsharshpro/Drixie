import type { Candle } from "@/components/trading";

export const MIN_SLOTS = 40;

export function fillForward(candles: readonly Candle[], intervalSec: number, max = 240): Candle[] {
  const n = candles.length;
  if (!n || !(intervalSec > 0)) return candles.slice(-max);
  const out: Candle[] = [];
  for (let i = n - 1; i >= 0 && out.length < max; i--) {
    const c = candles[i]!;
    out.push(c);
    const prev = candles[i - 1];
    if (!prev) break;
    const p = prev.close;
    for (let t = c.time - intervalSec; t > prev.time && out.length < max; t -= intervalSec) {
      out.push({ time: t, open: p, high: p, low: p, close: p, volume: 0 });
    }
  }
  return out.reverse();
}

export const isFlat = (c: Candle): boolean => c.high - c.low <= Math.abs(c.high) * 1e-9;

export interface LayoutOptions {
  width: number;
  height: number;

  spacing?: number;

  minSlots?: number;

  axis?: number;

  timeAxis?: number;

  volume?: number;

  padY?: number;
}

export interface CandleLayout {
  slots: number;
  spacing: number;
  bodyW: number;
  plotW: number;
  plotTop: number;
  plotBottom: number;
  volTop: number;
  volBottom: number;

  visible: Candle[];

  firstSlot: number;
  lo: number;
  hi: number;
  maxVol: number;

  xOfSlot: (s: number) => number;

  x: (i: number) => number;
  y: (price: number) => number;
}

export function layoutCandles(candles: readonly Candle[], o: LayoutOptions): CandleLayout {
  const axis = o.axis ?? 0;
  const timeAxis = o.timeAxis ?? 0;
  const minSlots = Math.max(1, o.minSlots ?? MIN_SLOTS);
  const plotW = Math.max(1, o.width - axis);
  const slots = o.spacing && o.spacing > 0 ? Math.max(minSlots, Math.floor(plotW / o.spacing)) : minSlots;
  const spacing = plotW / slots;

  const bodyW = Math.max(Math.min(2, spacing), Math.min(14, Math.round(spacing * 0.62 * 2) / 2));
  const visible = candles.slice(-slots);
  const firstSlot = slots - visible.length;

  const padY = o.padY ?? Math.max(4, Math.round(o.height * 0.08));
  const inner = o.height - timeAxis;
  const volH = o.volume ? Math.round(inner * o.volume) : 0;
  const plotTop = padY;
  const plotBottom = inner - padY - (volH ? volH + 4 : 0);
  const volBottom = inner - 1;
  const volTop = volBottom - volH;

  let lo = Infinity;
  let hi = -Infinity;
  let maxVol = 0;
  for (const c of visible) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
    if (c.volume > maxVol) maxVol = c.volume;
  }
  if (!visible.length) {
    lo = 0;
    hi = 1;
  } else if (hi - lo <= Math.abs(hi) * 1e-9) {
    const pad = Math.abs(hi) * 0.02 || 1e-6;
    lo -= pad;
    hi += pad;
  }
  const span = hi - lo;
  const h = Math.max(1, plotBottom - plotTop);
  const xOfSlot = (s: number) => (s + 0.5) * spacing;
  return {
    slots,
    spacing,
    bodyW,
    plotW,
    plotTop,
    plotBottom,
    volTop,
    volBottom,
    visible,
    firstSlot,
    lo,
    hi,
    maxVol,
    xOfSlot,
    x: (i: number) => xOfSlot(firstSlot + i),
    y: (p: number) => plotTop + ((hi - p) / span) * h,
  };
}

export function niceTicks(lo: number, hi: number, count = 3): number[] {
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return [];
  const levels = (step: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
    return out.filter((v) => v >= lo - step * 1e-9 && v <= hi + step * 1e-9);
  };
  const mag = Math.pow(10, Math.floor(Math.log10(span / Math.max(1, count))));
  let best: number[] = [];
  for (const m of [0.5, 1, 2, 2.5, 5, 10, 20]) {
    const t = levels(m * mag);
    if (t.length > 6) continue;
    if (!best.length || Math.abs(t.length - count) < Math.abs(best.length - count)) best = t;
  }
  return best;
}

export function timeLabelSlots(layout: Pick<CandleLayout, "slots" | "spacing" | "firstSlot">, minGap = 64): number[] {
  const every = Math.max(1, Math.ceil(minGap / layout.spacing));
  const out: number[] = [];
  for (let s = layout.slots - 1 - Math.floor(every / 2); s >= layout.firstSlot; s -= every) out.push(s);
  return out.reverse();
}
