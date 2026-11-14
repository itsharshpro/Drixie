"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { formatCandleTime, type Candle, type CandleInterval } from "@/components/trading";
import { axisDigits, formatNumber } from "@/lib/format";
import { isFlat, layoutCandles, MIN_SLOTS, niceTicks, timeLabelSlots } from "./candle-logic";
import "./charts.css";

export const AXIS_W = 56;
const TIME_AXIS_H = 20;

export interface LandingCandlesProps {

  candles: readonly Candle[];
  interval: CandleInterval;
  height: number;

  spacing?: number;
  minSlots?: number;

  axis?: boolean;

  grid?: boolean;
  volume?: boolean;

  lastLine?: boolean;
  timeAxis?: boolean;
  liveDot?: boolean;
  watermark?: string;
  loading?: boolean;

  empty?: ReactNode;

  onHover?: (c: Candle | null) => void;

  dimOnHover?: boolean;

  animateKey?: string;

  markerTime?: number | null;
  onMarkerX?: (fromRight: number | null) => void;
  label?: string;
  className?: string;

  overlays?: readonly CandleOverlay[];
}

export interface CandleOverlay {
  id: string;
  points: readonly { t: number; v: number }[];
  color: string;
  dashed?: boolean;
}

function useLayoutWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [w, setW] = useState(0);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const next = Math.round(e.contentRect.width);
      setW((cur) => (cur === next ? cur : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const UP = "var(--candle-up)";
const DOWN = "var(--candle-down)";

const FLAT = "color-mix(in oklab, var(--ink) 45%, transparent)";
const FLAT_VOL = "color-mix(in oklab, var(--ink) 14%, transparent)";

const colorOf = (c: Candle) => (isFlat(c) ? FLAT : c.close >= c.open ? UP : DOWN);

export function LandingCandles({
  candles,
  interval,
  height,
  spacing,
  minSlots = MIN_SLOTS,
  axis = false,
  grid = false,
  volume = false,
  lastLine = false,
  timeAxis = false,
  liveDot = false,
  watermark,
  loading,
  empty,
  onHover,
  dimOnHover = false,
  animateKey,
  markerTime,
  onMarkerX,
  label,
  className,
  overlays,
}: LandingCandlesProps) {
  const [ref, W] = useLayoutWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(
    () =>
      W > 0 && candles.length
        ? layoutCandles(candles, {
            width: W,
            height,
            spacing,
            minSlots,
            axis: axis ? AXIS_W : 0,
            timeAxis: timeAxis ? TIME_AXIS_H : 0,
            volume: volume ? 0.16 : 0,
          })
        : null,
    [W, candles, height, spacing, minSlots, axis, timeAxis, volume],
  );

  const ticks = useMemo(() => (geo && (axis || grid) ? niceTicks(geo.lo, geo.hi, height >= 200 ? 4 : 3) : []), [geo, axis, grid, height]);
  const digits = useMemo(() => (geo ? axisDigits(ticks.length ? ticks : [geo.lo, geo.hi], geo.hi) : 4), [geo, ticks]);
  const fmt = (p: number) => formatNumber(p, digits, { min: digits });

  const markerRef = useRef(onMarkerX);
  useEffect(() => {
    markerRef.current = onMarkerX;
  });
  useEffect(() => {
    const cb = markerRef.current;
    if (!cb) return;
    if (!geo || markerTime === null || markerTime === undefined) return cb(null);
    let idx = -1;
    for (let i = geo.visible.length - 1; i >= 0; i--) {
      if (geo.visible[i]!.time <= markerTime) {
        idx = i;
        break;
      }
    }
    cb(idx >= 0 ? W - geo.x(idx) : null);
  }, [geo, markerTime, W]);

  const overlayPaths = useMemo(() => {
    if (!geo || !overlays?.length || geo.visible.length < 2) return [];
    const vis = geo.visible;
    const iv = Math.max(1, vis[vis.length - 1]!.time - vis[vis.length - 2]!.time);
    const x0 = geo.x(0);
    const tMin = vis[0]!.time - (geo.firstSlot * iv);
    const xOfT = (t: number) => x0 + ((t - vis[0]!.time) / iv) * geo.spacing;
    let lo = Infinity;
    let hi = -Infinity;
    const kept = overlays.map((o) => ({ ...o, pts: o.points.filter((p) => p.t >= tMin && Number.isFinite(p.v)) }));
    for (const o of kept) for (const p of o.pts) {
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
    }
    if (!Number.isFinite(lo)) return [];
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const top = geo.plotTop + 4;
    const h = Math.max(1, geo.plotBottom - geo.plotTop - 8);
    return kept
      .filter((o) => o.pts.length > 1)
      .map((o) => ({
        id: o.id,
        color: o.color,
        dashed: !!o.dashed,
        d: o.pts
          .map((p, i) => `${i ? "L" : "M"}${Math.min(geo.plotW, Math.max(0, xOfT(p.t))).toFixed(1)} ${(top + ((hi - p.v) / (hi - lo)) * h).toFixed(1)}`)
          .join(""),
      }));
  }, [geo, overlays]);

  const visible = geo?.visible ?? [];
  const n = visible.length;
  const last = n ? visible[n - 1]! : null;
  const stagger = n ? Math.min(14, 640 / n) : 0;

  const CROSS = 6;

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!geo || !onHover) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) * W) / Math.max(1, r.width); // layout px (the chart may sit in a scaled box)
    const slot = Math.floor(px / geo.spacing);
    const i = slot - geo.firstSlot;
    const next = i >= 0 && i < n && px <= geo.plotW ? i : null;
    if (next !== hover) {
      setHover(next);
      onHover(next === null ? null : visible[next]!);
    }
  };
  const leave = () => {
    if (hover === null) return;
    setHover(null);
    onHover?.(null);
  };

  const summary = last ? `${label ?? "Candles"}: last $${fmt(last.close)}` : (label ?? "Candles");

  return (
    <div ref={ref} className={["relative w-full min-w-0", className].filter(Boolean).join(" ")} style={{ height }}>
      {loading && !candles.length ? (
        <div className="v4ch-skel absolute inset-x-0 bottom-1 top-2 rounded-[10px]" aria-hidden />
      ) : !candles.length ? (
        (empty ?? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-strong" />
            <span className="relative rounded-full bg-paper px-2.5 py-0.5 text-[11.5px] text-ink-2 shadow-[0_0_0_1px_var(--line)]">Waiting for the first trades</span>
          </div>
        ))
      ) : geo ? (
        <svg
          width={W}
          height={height}
          className="block overflow-visible"
          role="img"
          aria-label={summary}
          onPointerMove={onHover ? pick : undefined}
          onPointerLeave={onHover ? leave : undefined}
        >
          {watermark ? (
            <text
              x={geo.plotW / 2}
              y={(geo.plotTop + geo.plotBottom) / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="v4ch-mark"
              style={{ fontSize: Math.round(Math.min(104, geo.plotW / 4.6)) }}
            >
              {watermark}
            </text>
          ) : null}

          {grid
            ? ticks.map((t) => (
                <line key={`g${t}`} x1={0} x2={geo.plotW} y1={Math.round(geo.y(t)) + 0.5} y2={Math.round(geo.y(t)) + 0.5} className="v4ch-grid" />
              ))
            : null}

          {axis
            ? ticks.map((t) =>

                lastLine && last && Math.abs(geo.y(t) - geo.y(last.close)) < 14 ? null : (
                  <text key={`a${t}`} x={geo.plotW + 10} y={geo.y(t)} dominantBaseline="central" className="v4ch-axis">
                    {fmt(t)}
                  </text>
                ),
              )
            : null}

          {lastLine && last ? (
            <line
              x1={0}
              x2={geo.plotW}
              y1={0}
              y2={0}
              stroke={colorOf(last)}
              className="v4ch-last v4ch-morph"
              style={{ transform: `translateY(${Math.round(geo.y(last.close)) + 0.5}px)` }}
            />
          ) : null}

          {hover !== null ? <line x1={0} x2={0} y1={geo.plotTop - 6} y2={geo.volBottom} className="v4ch-cross" style={{ transform: `translateX(${Math.round(geo.x(hover)) + 0.5}px)` }} /> : null}

          <g key={animateKey ?? "c"}>
            {visible.map((c, i) => {
              const fill = colorOf(c);
              const x = Math.round(geo.x(i) * 2) / 2;
              const flat = isFlat(c);
              const yH = geo.y(c.high);
              const yL = geo.y(c.low);
              const yO = geo.y(c.open);
              const yC = geo.y(c.close);
              const mid = (yO + yC) / 2;
              const wickTop = flat ? mid - CROSS / 2 : Math.min(yH, mid - (Math.abs(yC - yO) < 1.5 ? CROSS / 2 : 0));
              const wickLen = flat ? CROSS : Math.max(Math.max(yL, mid + (Math.abs(yC - yO) < 1.5 ? CROSS / 2 : 0)) - wickTop, 1);
              const bodyTop = flat ? Math.round(mid) : Math.min(yO, yC);
              const bodyH = flat ? 1 : Math.max(1.5, Math.abs(yC - yO));
              const vh = volume && geo.maxVol > 0 && c.volume > 0 ? Math.max(1.5, (c.volume / geo.maxVol) * (geo.volBottom - geo.volTop)) : 0;
              const dim = dimOnHover && hover !== null && hover !== i;
              return (
                <g key={c.time} className="v4ch-morph" style={{ transform: `translateX(${x}px)`, opacity: dim ? 0.38 : 1 }}>
                  <g className="v4ch-in" style={{ animationDelay: `${Math.round(i * stagger)}ms` }}>
                    <rect x={-0.5} y={0} width={1} height={1} fill={fill} className="v4ch-morph" style={{ transform: `translateY(${wickTop}px) scaleY(${wickLen})` }} />
                    <rect
                      x={-geo.bodyW / 2}
                      y={0}
                      width={geo.bodyW}
                      height={1}
                      rx={flat ? 0 : Math.min(1.5, geo.bodyW / 4)}
                      fill={fill}
                      className="v4ch-morph"
                      style={{ transform: `translateY(${bodyTop}px) scaleY(${bodyH})` }}
                    />
                    {vh > 0 ? (
                      <rect
                        x={-geo.bodyW / 2}
                        y={0}
                        width={geo.bodyW}
                        height={1}
                        fill={flat ? FLAT_VOL : fill}
                        fillOpacity={flat ? 1 : 0.3}
                        className="v4ch-morph"
                        style={{ transform: `translateY(${geo.volBottom - vh}px) scaleY(${vh})` }}
                      />
                    ) : null}
                  </g>
                </g>
              );
            })}
          </g>

          {overlayPaths.map((o) => (
            <path
              key={o.id}
              d={o.d}
              fill="none"
              stroke={o.color}
              strokeWidth={o.dashed ? 1.25 : 1.5}
              strokeDasharray={o.dashed ? "4 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={o.dashed ? 0.7 : 0.9}
              pointerEvents="none"
            />
          ))}

          {liveDot && last ? (
            <g className="v4ch-morph" style={{ transform: `translate(${geo.x(n - 1)}px, ${geo.y(last.close)}px)` }} aria-hidden>
              <circle r={6} fill={colorOf(last)} className="v4ch-ring" />
              <circle r={2.75} fill={colorOf(last)} stroke="var(--paper)" strokeWidth={1.5} />
            </g>
          ) : null}

          {lastLine && axis && last ? (
            <g className="v4ch-morph" style={{ transform: `translate(${geo.plotW + 4}px, ${geo.y(last.close)}px)` }}>
              <rect x={0} y={-9} width={AXIS_W - 4} height={18} rx={4} fill={colorOf(last)} />
              <text x={(AXIS_W - 4) / 2} y={0} textAnchor="middle" dominantBaseline="central" className="v4ch-tag">
                {fmt(last.close)}
              </text>
            </g>
          ) : null}

          {timeAxis
            ? timeLabelSlots(geo).map((s) => {
                const c = visible[s - geo.firstSlot];
                return c ? (
                  <text key={`t${c.time}`} x={geo.xOfSlot(s)} y={height - 5} textAnchor="middle" className="v4ch-axis">
                    {formatCandleTime(c.time, interval)}
                  </text>
                ) : null;
              })
            : null}
        </svg>
      ) : null}
    </div>
  );
}
