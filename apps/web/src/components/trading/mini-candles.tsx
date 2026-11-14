"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { formatChange, formatNumber, priceDigits } from "@/lib/format";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { candleChange, formatCandleTime, isDoji, isUp, priceExtent, type Candle, type CandleInterval } from "./candles";
import { styles } from "./styles";

export interface MiniCandlesProps {
  candles: readonly Candle[];

  count?: number;

  minSlots?: number;

  align?: "right" | "center";

  barSpacing?: number;

  height?: number;

  volume?: boolean;

  lastLine?: boolean;

  tooltip?: boolean;

  onHover?: (c: Candle | null) => void;

  interval?: CandleInterval;

  focusable?: boolean;

  label?: string;

  loading?: boolean;

  emptyLabel?: string;
  className?: string;
}

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const MORPH = `transform 300ms ${EASE}, fill 200ms ${EASE}, opacity 160ms ${EASE}`;

export function MiniCandles({
  candles,
  count = 24,
  minSlots = 24,
  align = "right",
  barSpacing,
  height = 64,
  volume = false,
  lastLine = true,
  tooltip = true,
  onHover,
  interval = "5m",
  focusable = true,
  label,
  loading,
  emptyLabel = "Waiting for the first trades",
  className,
}: MiniCandlesProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = size.width;
  const fit = barSpacing && W > 0 ? Math.max(1, Math.floor(W / barSpacing)) : count;
  const shown = useMemo(() => candles.slice(-Math.min(count, fit)), [candles, count, fit]);
  const n = shown.length;

  const geo = useMemo(() => {
    const ext = priceExtent(shown);
    if (!ext || W <= 0) return null;
    const volH = volume ? Math.round(height * 0.2) : 0;
    const top = 6;
    const bottom = height - 6 - (volume ? volH + 4 : 0);
    const plotH = Math.max(1, bottom - top);
    const y = (p: number) => top + ((ext.hi - p) / (ext.hi - ext.lo)) * plotH;
    const slot = barSpacing ? barSpacing : W / Math.max(n, minSlots);
    const bw = Math.max(2, Math.min(14, slot * 0.62));

    const left = align === "center" ? (W - n * slot) / 2 : W - n * slot;
    const cx = (i: number) => left + (i + 0.5) * slot;
    const maxVol = Math.max(0, ...shown.map((c) => c.volume));
    return { y, cx, bw, slot, left, volH, maxVol };
  }, [shown, W, height, volume, minSlots, n, barSpacing, align]);

  const [enterOrder, setEnterOrder] = useState<Map<number, number> | null>(null);
  if (enterOrder === null && n > 0 && W > 0) setEnterOrder(new Map(shown.map((c, i) => [c.time, i])));

  const setIndex = (i: number | null) => {
    setHover(i);
    onHover?.(i === null ? null : (shown[i] ?? null));
  };

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (!geo || !n) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - geo.left) / geo.slot);
    setIndex(i >= 0 && i < n ? i : null);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!n) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const d = e.key === "ArrowLeft" ? -1 : 1;
      setIndex(Math.max(0, Math.min(n - 1, (hover ?? n) + d)));
    } else if (e.key === "Escape") setIndex(null);
  };

  const last = n ? shown[n - 1] : null;
  const digits = priceDigits(last?.close ?? 0);
  const fmt = (p: number) => formatNumber(p, digits, { min: digits });
  const summary =
    last && geo
      ? `${label ?? "Candles"}: ${n} candles, low ${fmt(Math.min(...shown.map((c) => c.low)))}, high ${fmt(Math.max(...shown.map((c) => c.high)))}, last ${fmt(last.close)} NEAR`
      : (label ?? "Candles");

  const h = hover !== null ? shown[hover] : null;

  return (
    <div ref={ref} className={cn("relative w-full min-w-0", className)} style={{ height }}>
      {loading && !n ? (
        <div className={cn(styles.skeleton, "absolute inset-x-0 bottom-0 top-2 rounded-chip")} aria-hidden />
      ) : !n ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-strong" />
          <span className="relative rounded-full bg-paper px-2.5 py-0.5 text-caption text-ink-2 shadow-[0_0_0_1px_var(--line)]">{emptyLabel}</span>
        </div>
      ) : geo ? (
        <svg
          width={W}
          height={height}
          className="block touch-pan-y overflow-visible rounded-chip outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          role="img"
          aria-label={summary}
          tabIndex={focusable ? 0 : undefined}
          onPointerMove={onPointer}
          onPointerLeave={() => setIndex(null)}
          onKeyDown={focusable ? onKey : undefined}
          onBlur={focusable ? () => setIndex(null) : undefined}
        >
          {lastLine && last && (
            <line
              x1={0}
              x2={W}
              y1={0}
              y2={0}
              stroke="var(--ink)"
              strokeOpacity={0.22}
              strokeDasharray="2 3"
              style={{ transform: `translateY(${geo.y(last.close)}px)`, transition: MORPH }}
            />
          )}
          {shown.map((c, i) => {
            const up = isUp(c);
            const doji = isDoji(c);

            const fill = doji ? "var(--ink-3)" : up ? "var(--candle-up)" : "var(--candle-down)";
            const x = geo.cx(i);
            const yHigh = geo.y(c.high);
            const yLow = geo.y(c.low);
            const yOpen = geo.y(c.open);
            const yClose = geo.y(c.close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyH = doji ? 1 : Math.max(1.5, Math.abs(yClose - yOpen));
            const dim = hover !== null && hover !== i;
            const enter = enterOrder?.get(c.time) ?? 0;
            const vh = volume && geo.maxVol > 0 ? Math.max(c.volume > 0 ? 1.5 : 0, (c.volume / geo.maxVol) * geo.volH) : 0;
            return (
              <g
                key={c.time}
                className={styles.miniCandle}
                data-doji={doji || undefined}
                style={{ ["--i" as string]: enter, transformOrigin: `0px ${yOpen}px`, transformBox: "view-box", opacity: dim ? 0.32 : 1 }}
              >
                <rect
                  x={-0.5}
                  y={0}
                  width={1}
                  height={1}
                  fill={fill}
                  style={{
                    transform:
                      doji && yLow - yHigh < 6
                        ? `translate(${x}px, ${yOpen - 3}px) scaleY(6)`
                        : `translate(${x}px, ${yHigh}px) scaleY(${Math.max(1, yLow - yHigh)})`,
                    transformOrigin: "0 0",
                    transition: MORPH,
                  }}
                />
                <rect
                  x={-geo.bw / 2}
                  y={0}
                  width={geo.bw}
                  height={1}
                  rx={Math.min(1.5, geo.bw / 4)}
                  fill={fill}
                  style={{ transform: `translate(${x}px, ${bodyTop}px) scaleY(${bodyH})`, transformOrigin: "0 0", transition: MORPH }}
                />
                {vh > 0 && (
                  <rect
                    x={-geo.bw / 2}
                    y={0}
                    width={geo.bw}
                    height={1}
                    fill={fill}
                    fillOpacity={0.3}
                    style={{ transform: `translate(${x}px, ${height - vh}px) scaleY(${vh})`, transformOrigin: "0 0", transition: MORPH }}
                  />
                )}
              </g>
            );
          })}
          <rect x={0} y={0} width={W} height={height} fill="transparent" />
        </svg>
      ) : null}

      {tooltip && h && geo && hover !== null && (
        <OhlcCard candle={h} digits={digits} time={formatCandleTime(h.time, interval)} side={geo.cx(hover) > W / 2 ? "left" : "right"} />
      )}
      <span className="sr-only" aria-live="polite">
        {h ? `${formatCandleTime(h.time, interval)}: open ${fmt(h.open)}, high ${fmt(h.high)}, low ${fmt(h.low)}, close ${fmt(h.close)} NEAR` : ""}
      </span>
    </div>
  );
}

function OhlcCard({ candle, digits, time, side }: { candle: Candle; digits: number; time: string; side: "left" | "right" }) {
  const up = isUp(candle);
  const ch = candleChange(candle);
  const f = (p: number) => formatNumber(p, digits, { min: digits });
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 z-10 rounded-control bg-paper px-2.5 py-1.5 shadow-[var(--e2)] [animation:fade-in_120ms_linear_both]",
        side === "left" ? "left-0" : "right-0",
      )}
      aria-hidden
    >
      <div className="num flex items-center justify-between gap-3 text-caption">
        <span className="text-ink-3">{time}</span>
        <span className={up ? "text-up" : "text-down"}>
          {Math.abs(ch ?? 0) >= 0.05 ? (up ? "▲ " : "▼ ") : ""}
          {formatChange(ch)}
        </span>
      </div>
      <dl className="num mt-0.5 grid grid-cols-[auto_auto_auto_auto] gap-x-1.5 text-caption">
        {(
          [
            ["O", candle.open],
            ["H", candle.high],
            ["L", candle.low],
            ["C", candle.close],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-ink">{f(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
