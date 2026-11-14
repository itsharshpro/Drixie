"use client";

import type { FundCandle, Holding } from "@listed/shared";
import { useId, useMemo, useState, type PointerEvent } from "react";
import type { Candle } from "@/components/trading";
import { cn } from "@/lib/cn";
import { LandingCandles } from "../../v4/charts/landing-candles";
import { fillForward } from "../../v4/charts/candle-logic";
import { domainOf, donutArcs, fmtBps, fmtPct, fundColor, linePath, type LineSeries } from "../data/logic";

export function NavLines({
  series,
  spy,
  selected,
  width,
  height,
  className,
  drawKey,
}: {
  series: LineSeries[];
  spy: LineSeries | null;
  selected: string | null;
  width: number;
  height: number;
  className?: string;
  drawKey?: string;
}) {
  const clip = useId();
  const all = useMemo(() => (spy ? [...series, spy] : series), [series, spy]);
  const dom = useMemo(() => domainOf(all), [all]);
  const [hx, setHx] = useState<number | null>(null);
  const AX = 44;
  const w = Math.max(0, width - AX);
  if (!dom || w <= 0) return null;
  const zeroY = height - ((0 - dom.v0) / (dom.v1 - dom.v0)) * height;
  const ticks = [dom.v1 - (dom.v1 - dom.v0) * 0.12, (dom.v0 + dom.v1) / 2, dom.v0 + (dom.v1 - dom.v0) * 0.12];
  const ordered = [...series].sort((a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0));
  const sel = series.find((s) => s.id === selected) ?? null;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    setHx(x >= 0 && x <= w ? x : null);
  };
  const hoverT = hx === null ? null : dom.t0 + (hx / w) * (dom.t1 - dom.t0);
  const at = (s: LineSeries | null) => {
    if (!s || hoverT === null || !s.points.length) return null;
    let best = s.points[0]!;
    for (const p of s.points) if (Math.abs(p.t - hoverT) < Math.abs(best.t - hoverT)) best = p;
    return best;
  };
  const hs = at(sel);
  const hspy = at(spy);
  const yOf = (v: number) => height - ((v - dom.v0) / (dom.v1 - dom.v0)) * height;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block overflow-visible", className)}
      onPointerMove={onMove}
      onPointerLeave={() => setHx(null)}
      role="img"
      aria-label="Fund returns versus SPY"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="-4" width={w} height={height + 8} className="v4f-draw" key={drawKey} />
        </clipPath>
      </defs>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1="0" x2={w} y1={yOf(v)} y2={yOf(v)} stroke="color-mix(in oklab, var(--ink) 5%, transparent)" strokeDasharray="3 4" />
          <text x={w + 8} y={yOf(v) + 3.5} className="fill-ink-3 font-mono text-[10.5px]">
            {fmtPct(v)}
          </text>
        </g>
      ))}
      {zeroY > 0 && zeroY < height ? <line x1="0" x2={w} y1={zeroY} y2={zeroY} stroke="var(--line-strong)" /> : null}
      <g clipPath={`url(#${clip})`}>
        {spy ? <path d={linePath(spy, dom, w, height)} fill="none" stroke="var(--ink-3)" strokeWidth="1.4" strokeDasharray="4 4" /> : null}
        {ordered.map((s) => {
          const on = s.id === selected;
          const d = linePath(s, dom, w, height);
          return (
            <g key={s.id} style={{ transition: "opacity 300ms var(--v4-ease)" }} opacity={selected && !on ? 0.28 : 1}>
              {on ? <path d={`${d}L${w} ${height}L0 ${height}Z`} fill={fundColor(s.id)} opacity={0.08} /> : null}
              <path d={d} fill="none" stroke={fundColor(s.id)} strokeWidth={on ? 2 : 1.4} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
      </g>
      {sel?.points.length ? (
        <circle cx={w} cy={yOf(sel.points[sel.points.length - 1]!.v)} r="3.5" fill={fundColor(sel.id)} stroke="#fff" strokeWidth="1.5" />
      ) : null}
      {hx !== null ? (
        <g pointerEvents="none">
          <line x1={hx} x2={hx} y1="0" y2={height} stroke="color-mix(in oklab, var(--ink) 28%, transparent)" strokeDasharray="3 3" />
          {hs ? <circle cx={hx} cy={yOf(hs.v)} r="3.5" fill={fundColor(sel!.id)} stroke="#fff" strokeWidth="1.5" /> : null}
          {hspy ? <circle cx={hx} cy={yOf(hspy.v)} r="3" fill="var(--paper)" stroke="var(--ink-3)" strokeWidth="1.4" /> : null}
          <g transform={`translate(${Math.min(Math.max(hx - 64, 0), w - 128)} 4)`}>
            <rect width="128" height={hspy ? 40 : 24} rx="8" fill="var(--paper)" stroke="var(--line)" />
            {hs ? (
              <text x="10" y="16" className="font-mono text-[11px]" fill="var(--ink)">
                <tspan fill={fundColor(sel!.id)}>●</tspan> {fmtPct(hs.v, 2)}
              </text>
            ) : null}
            {hspy ? (
              <text x="10" y="32" className="font-mono text-[11px]" fill="var(--ink-2)">
                SPY {fmtPct(hspy.v, 2)}
              </text>
            ) : null}
          </g>
        </g>
      ) : null}
    </svg>
  );
}

function shade(id: string, i: number, n: number): string {
  const pct = 100 - Math.round((i / Math.max(1, n - 1)) * 62);
  return `color-mix(in oklab, ${fundColor(id)} ${pct}%, #fff)`;
}

export function HoldingsDonut({
  id,
  holdings,
  cashBps,
  size = 132,
  center,
  className,
}: {
  id: string;
  holdings: readonly Pick<Holding, "asset" | "bps">[] | null;
  cashBps?: number;
  size?: number;
  center?: React.ReactNode;
  className?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const r = size / 2;
  const inner = r * 0.66;
  const slices = useMemo(() => {
    const hs = [...(holdings ?? [])].filter((h) => h.bps > 0).sort((a, b) => b.bps - a.bps);
    const out = hs.map((h) => ({ key: h.asset, bps: h.bps }));
    if (cashBps && cashBps > 0) out.push({ key: "Cash", bps: cashBps });
    return out;
  }, [holdings, cashBps]);
  const arcs = useMemo(() => donutArcs(slices, r - 1, inner), [slices, r, inner]);
  const hov = hover ? slices.find((s) => s.key === hover) : null;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} className="block" role="img" aria-label={arcs.length ? `${arcs.length} slices` : "No holdings yet"}>
        {arcs.length ? (
          arcs.map((a, i) => (
            <path
              key={a.key}
              d={a.d}
              fill={a.key === "Cash" ? "var(--line-strong)" : shade(id, i, arcs.length)}
              className="v4f-slice"
              style={{ "--i": i, opacity: hover && hover !== a.key ? 0.4 : 1 } as React.CSSProperties}
              onPointerEnter={() => setHover(a.key)}
              onPointerLeave={() => setHover(null)}
            />
          ))
        ) : (
          <>
            {Array.from({ length: 10 }, (_, i) => {
              const sl = donutArcs(
                Array.from({ length: 10 }, (_, k) => ({ key: String(k), bps: 1000 })),
                r - 1,
                inner,
                4,
              )[i]!;
              return <path key={i} d={sl.d} fill="none" stroke="var(--line-strong)" strokeDasharray="2 3" />;
            })}
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        {hov ? (
          <span className="flex flex-col items-center">
            <span className="font-mono text-[12px] font-medium text-ink">{hov.key}</span>
            <span className="font-mono text-[11px] text-ink-3">{fmtBps(hov.bps)}</span>
          </span>
        ) : (
          center
        )}
      </div>
    </div>
  );
}

const INTERVAL_SEC = { "5m": 300, "15m": 900, "1h": 3600, "1d": 86400 } as const;

export function toCandles(cs: readonly FundCandle[] | undefined, interval: keyof typeof INTERVAL_SEC = "5m"): Candle[] {
  if (!cs?.length) return [];
  const raw: Candle[] = [];
  for (const c of cs) {
    const t = Math.floor(Date.parse(c.t) / 1000);
    if (!Number.isFinite(t)) continue;
    raw.push({ time: t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v });
  }
  raw.sort((a, b) => a.time - b.time);
  return fillForward(raw, INTERVAL_SEC[interval], 96);
}

export function CoinCandles({
  candles,
  height,
  loading,
  label,
  axis = true,
  watermark,
  className,
  empty,
}: {
  candles: Candle[];
  height: number;
  loading?: boolean;
  label: string;
  axis?: boolean;
  watermark?: string;
  className?: string;
  empty?: React.ReactNode;
}) {
  return (
    <LandingCandles
      className={className}
      candles={candles}
      interval="5m"
      height={height}
      axis={axis}
      grid={axis}
      volume
      lastLine
      liveDot
      loading={loading}
      watermark={watermark}
      label={label}
      empty={empty}
      minSlots={40}
    />
  );
}
