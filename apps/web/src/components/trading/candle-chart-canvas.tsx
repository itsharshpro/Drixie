"use client";

import type {
  AutoscaleInfo,
  CandlestickData,
  HistogramData,
  IChartApi,
  ISeriesApi,
  ITextWatermarkPluginApi,
  MouseEventParams,
  Time,
  UTCTimestamp,
  WhitespaceData,
} from "lightweight-charts";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { formatClock, formatDay, formatNumber, priceDigits } from "@/lib/format";
import { formatCandleTime, isDoji, isUp, type Candle, type CandleInterval } from "./candles";
import { alpha, readTradingTheme, type TradingTheme } from "./theme";
import { styles } from "./styles";

type Lwc = typeof import("lightweight-charts");
type Bar = CandlestickData<Time> | WhitespaceData<Time>;
type VolBar = HistogramData<Time> | WhitespaceData<Time>;

export interface CandleChartCanvasProps {
  candles: readonly Candle[];
  interval: CandleInterval;

  ticker?: string;

  height?: number;
  watermark?: boolean;

  interactive?: boolean;

  attribution?: boolean;

  animateKey?: string;

  onHover?: (c: Candle | null) => void;

  barSpacing?: number;
  className?: string;
}

const ENTRANCE_MIN = 600;
const ENTRANCE_MAX = 1000;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const ts = (c: Candle) => c.time as UTCTimestamp;

function axisPrice(p: number, digits: number): string {
  if (p < -Math.pow(10, -digits) / 2) return "";
  return formatNumber(Math.max(0, p), digits, { min: digits });
}

function toBar(c: Candle, theme?: TradingTheme): CandlestickData<Time> {
  const bar: CandlestickData<Time> = { time: ts(c), open: c.open, high: c.high, low: c.low, close: c.close };
  if (theme && isDoji(c)) {
    const neutral = alpha(theme.ink, 0.45);
    bar.color = neutral;
    bar.wickColor = neutral;
    bar.borderColor = neutral;
  }
  return bar;
}

function toVol(c: Candle, theme: TradingTheme, scale = 1): HistogramData<Time> {
  const color = isDoji(c) ? alpha(theme.ink, 0.14) : alpha(isUp(c) ? theme.up : theme.down, 0.3);
  return { time: ts(c), value: c.volume * scale, color };
}

function growing(c: Candle, f: number): CandlestickData<Time> {
  const o = c.open;
  return { time: ts(c), open: o, close: o + (c.close - o) * f, high: o + (c.high - o) * f, low: o + (c.low - o) * f };
}

const AXIS_W = 72; // right price scale, roughly
const RIGHT_OFFSET = 4; // empty slots right of the newest candle (room for the live dot and price label)
export const MIN_SLOTS = 40;

export function spacingFor(width: number, fixed?: number): number {
  if (fixed && fixed > 0) return fixed;
  return Math.max(4, Math.min(16, (width - AXIS_W) / (MIN_SLOTS + RIGHT_OFFSET)));
}

function frameSeries(chart: IChartApi, n: number, width: number, fixed?: number): boolean {
  const spacing = spacingFor(width, fixed);
  const slots = Math.max(1, (width - AXIS_W) / spacing);
  chart.timeScale().applyOptions({ barSpacing: spacing, rightOffset: RIGHT_OFFSET });
  const to = n - 1 + RIGHT_OFFSET;
  chart.timeScale().setVisibleLogicalRange({ from: to - slots, to });
  return false;
}

function sameCandle(a: Candle | undefined, b: Candle | undefined): boolean {
  return !!a && !!b && a.time === b.time && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;
}

export function CandleChartCanvas({
  candles,
  interval,
  ticker,
  height = 360,
  watermark = true,
  interactive = true,
  attribution = true,
  animateKey,
  onHover,
  barSpacing,
  className,
}: CandleChartCanvasProps) {
  const reduce = useReducedMotion() ?? false;
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const barSpacingRef = useRef(barSpacing);

  const s = useRef<{
    lwc: Lwc | null;
    chart: IChartApi | null;
    candle: ISeriesApi<"Candlestick"> | null;
    volume: ISeriesApi<"Histogram"> | null;
    mark: ITextWatermarkPluginApi<Time> | null;
    theme: TradingTheme;
    applied: Candle[];
    key: string | undefined;
    latest: readonly Candle[];
    byTime: Map<number, Candle>;
    anim: number;
    animRange: { lo: number; hi: number; vol: number } | null;
    digits: number;
    interval: CandleInterval;
    sparse: boolean;
    height: number;
    kbd: number | null;
    onHover: CandleChartCanvasProps["onHover"];
  }>({
    lwc: null,
    chart: null,
    candle: null,
    volume: null,
    mark: null,
    theme: readTradingTheme(null),
    applied: [],
    key: undefined,
    latest: [],
    byTime: new Map(),
    anim: 0,
    animRange: null,
    digits: 4,
    interval,
    sparse: false,
    height,
    kbd: null,
    onHover,
  });

  useEffect(() => {
    s.current.onHover = onHover;
    s.current.interval = interval;
    barSpacingRef.current = barSpacing;
  });

  const placeDot = () => {
    const st = s.current;
    const dot = dotRef.current;
    const last = st.latest[st.latest.length - 1];
    if (!dot || !st.chart || !st.candle || !last || st.anim) {
      if (dot) dot.style.opacity = "0";
      return;
    }
    const x = st.chart.timeScale().timeToCoordinate(ts(last));
    const y = st.candle.priceToCoordinate(last.close);
    const w = plotRef.current?.clientWidth ?? 0;
    if (x === null || y === null || x < 0 || x > w - 60) {
      dot.style.opacity = "0";
      return;
    }
    dot.style.opacity = "1";
    dot.style.transform = `translate(${x}px, ${y}px)`;
    dot.style.backgroundColor = isUp(last) ? st.theme.up : st.theme.down;
  };

  const ping = () => {
    const dot = dotRef.current;
    if (!dot || reduce) return;
    dot.classList.remove(styles.liveDotPing);
    void dot.offsetWidth; // restart the ring animation
    dot.classList.add(styles.liveDotPing);
  };

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    const st = s.current;

    void import("lightweight-charts").then((lwc) => {
      const host = plotRef.current;
      if (disposed || !host) return;
      const theme = readTradingTheme(host);
      st.lwc = lwc;
      st.theme = theme;
      const width = Math.max(1, host.clientWidth);
      const chart = lwc.createChart(host, {
        width,
        height,
        layout: {
          background: { type: lwc.ColorType.Solid, color: "rgba(0, 0, 0, 0)" },
          textColor: alpha(theme.ink, 0.5),
          fontSize: 11,
          fontFamily: theme.mono,
          attributionLogo: attribution,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: alpha(theme.ink, 0.07), style: lwc.LineStyle.Dashed },
        },
        rightPriceScale: { borderVisible: false, entireTextOnly: true, minimumWidth: 64, scaleMargins: { top: 0.14, bottom: 0.26 } },
        timeScale: {
          borderVisible: false,
          rightOffset: RIGHT_OFFSET,
          barSpacing: 10,
          minBarSpacing: 3,
          timeVisible: true,
          secondsVisible: false,
          lockVisibleTimeRangeOnResize: true,
          tickMarkFormatter: (time: Time, type: number) => {
            const d = new Date((time as number) * 1000);

            if (type === 0) return String(d.getFullYear());
            if (type === 1) return d.toLocaleDateString("en-US", { month: "short" });
            if (type === 2) return formatDay(d);
            return formatClock(d);
          },
        },
        crosshair: {
          mode: lwc.CrosshairMode.Normal,
          vertLine: { color: alpha(theme.ink, 0.28), width: 1, style: lwc.LineStyle.Dashed, labelBackgroundColor: theme.ink },
          horzLine: { color: alpha(theme.ink, 0.28), width: 1, style: lwc.LineStyle.Dashed, labelBackgroundColor: theme.ink },
        },
        localization: {
          locale: "en-US",
          timeFormatter: (time: Time) => formatCandleTime(time as number, st.interval),
        },
        handleScroll: interactive ? { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false } : false,
        handleScale: interactive ? { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true } : false,
        kineticScroll: { mouse: false, touch: true },
      });

      const candle = chart.addSeries(lwc.CandlestickSeries, {
        upColor: theme.up,
        downColor: theme.down,
        wickUpColor: theme.up,
        wickDownColor: theme.down,
        borderVisible: false,
        priceLineVisible: true,
        priceLineStyle: lwc.LineStyle.Dotted,
        priceLineWidth: 1,
        lastValueVisible: true,
        priceFormat: { type: "custom", minMove: 0.0001, formatter: (p: number) => axisPrice(p, st.digits) },
        autoscaleInfoProvider: (original: () => AutoscaleInfo | null) =>
          st.animRange ? { priceRange: { minValue: st.animRange.lo, maxValue: st.animRange.hi } } : original(),
      });
      const volume = chart.addSeries(lwc.HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
        autoscaleInfoProvider: (original: () => AutoscaleInfo | null) =>
          st.animRange ? { priceRange: { minValue: 0, maxValue: Math.max(st.animRange.vol, 1e-9) } } : original(),
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false });

      st.chart = chart;
      st.candle = candle;
      st.volume = volume;
      if (watermark && ticker) {
        st.mark = lwc.createTextWatermark(chart.panes()[0], {
          horzAlign: "center",
          vertAlign: "center",
          lines: [{ text: ticker.toUpperCase(), color: alpha(theme.ink, 0.045), fontSize: Math.round(Math.min(112, width / 4.5)), fontFamily: theme.sans, fontStyle: "600" }],
        });
      }

      chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
        if (st.kbd !== null && !param.point) return; // keyboard crosshair owns the legend
        const c = param.time !== undefined && param.point ? st.byTime.get(param.time as number) : undefined;
        st.onHover?.(c ?? null);
      });
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => placeDot());

      ro = new ResizeObserver(() => {
        const w = Math.max(1, host.clientWidth);

        chart.resize(w, st.height);
        if (st.latest.length && !st.anim) frameSeries(chart, st.latest.length, w, barSpacingRef.current);
        st.mark?.applyOptions({ lines: [{ text: (ticker ?? "").toUpperCase(), color: alpha(theme.ink, 0.045), fontSize: Math.round(Math.min(112, w / 4.5)), fontFamily: theme.sans, fontStyle: "600" }] });
        requestAnimationFrame(placeDot);
      });
      ro.observe(host);
      setReady(true);
    });

    return () => {
      disposed = true;
      ro?.disconnect();
      cancelAnimationFrame(st.anim);
      st.anim = 0;
      st.mark?.detach();
      st.chart?.remove();
      st.chart = null;
      st.candle = null;
      st.volume = null;
      st.mark = null;
      st.applied = [];
      st.key = undefined;
    };

  }, []);

  useEffect(() => {
    const st = s.current;
    st.height = height;
    if (!ready || !st.chart || !plotRef.current) return;
    st.chart.resize(Math.max(1, plotRef.current.clientWidth), height);
    st.chart.applyOptions({
      handleScroll: interactive ? { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false } : false,
      handleScale: interactive ? { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true } : false,
      timeScale: { timeVisible: interval !== "1D" },
    });
  }, [ready, height, interactive, interval]);

  useEffect(() => {
    const st = s.current;
    if (!ready || !st.chart || !st.candle || !st.volume) return;
    const chart = st.chart;
    const cs = st.candle;
    const vs = st.volume;
    const theme = st.theme;
    const list = candles as Candle[];
    st.latest = list;
    st.byTime = new Map(list.map((c) => [c.time, c]));

    const last = list[list.length - 1];
    const digits = priceDigits(last ? Math.max(...list.slice(-50).map((c) => c.high)) : 0);
    if (digits !== st.digits) {
      st.digits = digits;
      cs.applyOptions({ priceFormat: { type: "custom", minMove: Math.pow(10, -digits), formatter: (p: number) => axisPrice(p, st.digits) } });
    }

    const keyChanged = st.key !== animateKey;
    if (st.anim && !keyChanged) return; // the running entrance reads `latest` every frame and lands on it
    if (st.anim) {

      cancelAnimationFrame(st.anim);
      st.anim = 0;
      st.animRange = null;
      cs.applyOptions({ lastValueVisible: true, priceLineVisible: true });
    }

    const prev = st.applied;
    const width = plotRef.current?.clientWidth ?? 600;

    const setAll = () => {
      cs.setData(list.map((c) => toBar(c, theme)));
      vs.setData(list.map((c) => toVol(c, theme)));
      st.applied = list.slice();
    };

    if (!list.length) {
      cs.setData([]);
      vs.setData([]);
      st.applied = [];
      st.key = animateKey;
      placeDot();
      return;
    }

    const incremental =
      !keyChanged &&
      prev.length > 0 &&
      list[0].time === prev[0].time &&
      (list.length === prev.length || list.length === prev.length + 1) &&
      list.slice(0, prev.length - 1).every((c, i) => sameCandle(c, prev[i]));
    if (incremental) {
      const tail = list.slice(prev.length - 1);
      for (const c of tail) {
        cs.update(toBar(c, theme));
        vs.update(toVol(c, theme));
      }
      const before = prev[prev.length - 1];
      st.applied = list.slice();

      if (list.length !== prev.length && st.sparse) st.sparse = frameSeries(chart, list.length, width, barSpacing);
      requestAnimationFrame(placeDot);
      if (!before || before.close !== last.close || list.length !== prev.length) ping();
      return;
    }

    if (!keyChanged && prev.length > 0) {

      setAll();
      if (st.sparse) st.sparse = frameSeries(chart, list.length, width, barSpacing);
      requestAnimationFrame(placeDot);
      return;
    }

    st.key = animateKey;
    if (reduce) {
      setAll();
      st.sparse = frameSeries(chart, list.length, width, barSpacing);
      requestAnimationFrame(placeDot);
      return;
    }

    const blanks: WhitespaceData<Time>[] = list.map((c) => ({ time: ts(c) }));
    cs.setData(blanks);
    vs.setData(blanks);
    st.sparse = frameSeries(chart, list.length, width, barSpacing);
    const lr = chart.timeScale().getVisibleLogicalRange();
    const from = Math.max(0, Math.floor(lr?.from ?? 0));
    const to = Math.min(list.length - 1, Math.ceil(lr?.to ?? list.length - 1));
    const visible = list.slice(from, to + 1);
    st.animRange = visible.length
      ? { lo: Math.min(...visible.map((c) => c.low)), hi: Math.max(...visible.map((c) => c.high)), vol: Math.max(0, ...visible.map((c) => c.volume)) }
      : null;
    if (st.animRange && st.animRange.hi - st.animRange.lo < st.animRange.hi * 1e-9) {
      const pad = st.animRange.hi * 0.01 || 1e-6;
      st.animRange = { ...st.animRange, lo: st.animRange.lo - pad, hi: st.animRange.hi + pad };
    }

    const shownFrom = from;
    const count = Math.max(1, list.length - shownFrom);
    const duration = Math.max(ENTRANCE_MIN, Math.min(ENTRANCE_MAX, 420 + count * 9));
    const t0 = performance.now();
    if (dotRef.current) dotRef.current.style.opacity = "0";

    cs.applyOptions({ lastValueVisible: false, priceLineVisible: false });

    const frame = (now: number) => {
      const data = st.latest as Candle[];
      const p = easeOut(Math.min(1, (now - t0) / duration));
      if (p >= 1 || !st.candle || !st.volume) {
        st.anim = 0;
        st.animRange = null;
        if (st.candle && st.volume) {
          st.candle.applyOptions({ lastValueVisible: true, priceLineVisible: true });
          st.candle.setData(data.map((c) => toBar(c, st.theme)));
          st.volume.setData(data.map((c) => toVol(c, st.theme)));
          st.applied = data.slice();
        }
        requestAnimationFrame(placeDot);
        return;
      }
      const k = shownFrom + p * count;
      const full = Math.min(data.length, Math.floor(k));
      const f = k - full;
      const bars: Bar[] = [];
      const vols: VolBar[] = [];
      for (let i = 0; i < data.length; i++) {
        const c = data[i];
        if (i < full) {
          bars.push(toBar(c, st.theme));
          vols.push(toVol(c, st.theme));
        } else if (i === full) {
          bars.push(growing(c, f));
          vols.push(toVol(c, st.theme, f));
        } else {
          bars.push({ time: ts(c) });
          vols.push({ time: ts(c) });
        }
      }
      st.candle.setData(bars);
      st.volume.setData(vols);
      st.anim = requestAnimationFrame(frame);
    };
    st.anim = requestAnimationFrame(frame);

  }, [ready, candles, animateKey]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const st = s.current;
    const list = st.latest;
    if (!st.chart || !st.candle || !list.length) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const cur = st.kbd ?? list.length;
      const next =
        e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : Math.max(0, Math.min(list.length - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
      st.kbd = next;
      const c = list[next];
      st.chart.setCrosshairPosition(c.close, ts(c), st.candle);
      st.onHover?.(c);
    } else if (e.key === "Escape") {
      clearKbd();
    }
  };
  const clearKbd = () => {
    const st = s.current;
    if (st.kbd === null) return;
    st.kbd = null;
    st.chart?.clearCrosshairPosition();
    st.onHover?.(null);
  };

  return (
    <div ref={hostRef} className={cn("relative w-full min-w-0", className)} style={{ height }}>
      <div
        ref={plotRef}
        className={cn("absolute inset-0 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand", !ready && "opacity-0")}
        style={{ transition: reduce ? "opacity 150ms linear" : "opacity 200ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        tabIndex={0}
        aria-label="Candle chart. Use the left and right arrow keys to read candles."
        onKeyDown={onKey}
        onBlur={clearKbd}
      />
      <span ref={dotRef} className={styles.liveDot} style={{ opacity: 0 }} aria-hidden />
    </div>
  );
}
