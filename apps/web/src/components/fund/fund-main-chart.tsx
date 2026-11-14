"use client";

import type { FundCandleInterval, FundDetail, NavRange } from "@listed/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { candlesChange, chartInterval, FUND_INTERVAL_LABEL, FUND_INTERVAL_WORDS, FUND_INTERVALS, rangeLabel, toCandles } from "@/lib/funds/candles";
import { pct, price } from "@/lib/funds/format";
import { fundColorVar } from "@/lib/funds/meta";
import { useFundCandles, useNav } from "@/lib/funds/queries";
import { ChartCard } from "../charts/chart-frame";
import { formatCandleTime, type Candle } from "../trading/candles";
import { TimeframeTabs } from "../trading/timeframe-tabs";
import { EmptyState } from "../ui/empty-state";
import { Crossfade } from "../ui/transitions";

const BAR = 9; // constant bar spacing, px
const NAV_RANGE: Record<FundCandleInterval, NavRange> = { "5m": "1D", "15m": "1D", "1h": "4D", "1d": "SEASON" };
const PAD = { l: 8, r: 56, t: 12, b: 24 };
const LABEL_GAP = 96; // min px between x labels

export function FundMainChart({ fund, height = 320, className }: { fund: FundDetail; height?: number; className?: string }) {
  const [interval, setIv] = useState<FundCandleInterval>("15m");
  const q = useFundCandles(fund.id, interval);
  const nav = useNav(fund.id, NAV_RANGE[interval]);
  const candles = useMemo(() => toCandles(q.data?.candles), [q.data]);
  const navPoints = useMemo(() => nav.data?.points ?? [], [nav.data]);
  const lastNav = navPoints[navPoints.length - 1];
  const lastSpy = [...navPoints].reverse().find((p) => p.spy !== null)?.spy ?? null;
  return (
    <ChartCard
      className={className}
      title="Coin price"
      sub={`USD per coin · ${FUND_INTERVAL_WORDS[interval]} candles, NAV and SPY over the same time`}
      value={price(fund.coinPrice)}
      change={candlesChange(candles)}
      changeLabel={rangeLabel(candles)}
      controls={<TimeframeTabs<FundCandleInterval> value={interval} onChange={setIv} options={FUND_INTERVALS} labels={FUND_INTERVAL_LABEL} label="Candle interval" />}
      legend={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-flex gap-0.5">
              <span className="inline-block h-3 w-1.5 rounded-[1px] bg-candle-up" />
              <span className="inline-block h-3 w-1.5 rounded-[1px] bg-candle-down" />
            </span>
            Coin
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: fundColorVar(fund.id) }} /> NAV{" "}
            <span className="num">{price(fund.nav)}</span> <span className="num text-ink-3">{pct(lastNav?.ret ?? null)}</span>
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block w-3 border-t-2 border-dashed border-viz-slate" /> SPY <span className="num">{pct(lastSpy)}</span>
          </span>
        </span>
      }
      footnote="Coin trades in its own pool; buying in at NAV does not move it. NAV is posted on-chain after every bell."
    >
      <Crossfade value={interval}>
        {!q.data && q.isPending ? (
          <div className="skeleton rounded-control" style={{ height }} aria-hidden />
        ) : candles.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <EmptyState icon="market" title="No coin trades yet" body="Candles appear with the first trade in this coin's pool." compact />
          </div>
        ) : (
          <CandlesWithOverlays candles={candles} interval={interval} nav={navPoints} color={fundColorVar(fund.id)} height={height} label={`${fund.name} coin candles with NAV and SPY`} />
        )}
      </Crossfade>
    </ChartCard>
  );
}

type NavPt = { t: string; nav: number; spy: number | null };

function CandlesWithOverlays({
  candles,
  interval,
  nav,
  color,
  height,
  label,
}: {
  candles: readonly Candle[];
  interval: FundCandleInterval;
  nav: readonly NavPt[];
  color: string;
  height: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(0, width - PAD.l - PAD.r);
  const count = Math.max(1, Math.min(candles.length, Math.floor(plotW / BAR)));
  const shown = candles.slice(-count);
  const t0 = shown[0]?.time ?? 0;
  const t1 = shown[shown.length - 1]?.time ?? 0;
  const step = shown.length > 1 ? (t1 - t0) / (shown.length - 1) : 1;
  const x0 = PAD.l + plotW - shown.length * BAR + BAR / 2; // right-aligned, constant spacing
  const xOfIndex = (i: number) => x0 + i * BAR;
  const xOfTime = (sec: number) => xOfIndex(step > 0 ? (sec - t0) / step : 0);

  const navPts = nav.map((p) => ({ sec: Date.parse(p.t) / 1000, nav: p.nav, spy: p.spy })).filter((p) => p.sec >= t0 - step && p.sec <= t1 + step);
  const base = navPts[0];
  const spyBase = navPts.find((p) => p.spy !== null);
  const overlay = navPts.map((p) => ({
    sec: p.sec,
    nav: p.nav,
    spy: p.spy !== null && spyBase && base ? base.nav * ((1 + p.spy / 100) / (1 + (spyBase.spy ?? 0) / 100)) : null,
  }));

  const volH = Math.round(height * 0.16);
  const priceH = height - PAD.t - PAD.b - volH - 6;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of shown) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  for (const p of overlay) {
    lo = Math.min(lo, p.nav, p.spy ?? Infinity);
    hi = Math.max(hi, p.nav, p.spy ?? -Infinity);
  }
  if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
  if (hi - lo < 1e-9) [lo, hi] = [lo * 0.99, hi * 1.01 + 1e-6];
  const padY = (hi - lo) * 0.06;
  lo -= padY;
  hi += padY;
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * priceH;
  const maxVol = Math.max(1e-9, ...shown.map((c) => c.volume));
  const volTop = PAD.t + priceH + 6;

  const yTicks = Array.from({ length: 4 }, (_, i) => lo + padY + ((hi - lo - 2 * padY) * i) / 3);
  const every = Math.max(1, Math.ceil(LABEL_GAP / BAR));
  const xTicks: number[] = [];
  for (let i = shown.length - 1 - Math.floor(every / 2); i >= 0; i -= every) xTicks.push(i);

  const path = (vals: { sec: number; v: number | null }[]) =>
    vals.reduce((acc, p) => (p.v === null ? acc : `${acc}${acc ? "L" : "M"}${xOfTime(p.sec).toFixed(1)},${y(p.v).toFixed(1)}`), "");
  const navPath = path(overlay.map((p) => ({ sec: p.sec, v: p.nav })));
  const spyPath = path(overlay.map((p) => ({ sec: p.sec, v: p.spy })));
  const h = hover !== null ? shown[hover] : null;
  const last = shown[shown.length - 1];
  const iv = chartInterval(interval);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={height}
          className="block touch-none"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round((e.clientX - r.left - x0) / BAR);
            setHover(i >= 0 && i < shown.length ? i : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={PAD.l + plotW} y1={y(v)} y2={y(v)} className="stroke-line" strokeDasharray="2 4" />
              <text x={width - PAD.r + 6} y={y(v) + 4} className="num fill-ink-3" fontSize={11}>
                {price(v)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={xOfIndex(i)} y={height - 6} textAnchor="middle" className="num fill-ink-3" fontSize={11}>
              {formatCandleTime(shown[i].time, iv)}
            </text>
          ))}
          {shown.map((c, i) => {
            const up = c.close >= c.open;
            const cx = xOfIndex(i);
            const top = y(Math.max(c.open, c.close));
            const bh = Math.max(1, Math.abs(y(c.open) - y(c.close)));
            return (
              <g key={c.time} className={up ? "fill-candle-up stroke-candle-up" : "fill-candle-down stroke-candle-down"} opacity={hover === null || hover === i ? 1 : 0.55}>
                <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} />
                <rect x={cx - (BAR - 3) / 2} y={top} width={BAR - 3} height={bh} rx={1} strokeWidth={0} />
                <rect x={cx - (BAR - 3) / 2} y={volTop + volH - (c.volume / maxVol) * volH} width={BAR - 3} height={(c.volume / maxVol) * volH} opacity={0.28} strokeWidth={0} />
              </g>
            );
          })}
          {spyPath && <path d={spyPath} fill="none" className="stroke-viz-slate" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" />}
          {navPath && <path d={navPath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {last && (
            <g>
              <line x1={PAD.l} x2={PAD.l + plotW} y1={y(last.close)} y2={y(last.close)} className="stroke-ink-3" strokeDasharray="1 3" />
              <rect x={width - PAD.r + 2} y={y(last.close) - 9} width={PAD.r - 4} height={18} rx={4} className={last.close >= last.open ? "fill-candle-up" : "fill-candle-down"} />
              <text x={width - PAD.r + 6} y={y(last.close) + 4} fontSize={11} className="num fill-white">
                {price(last.close)}
              </text>
            </g>
          )}
          {hover !== null && <line x1={xOfIndex(hover)} x2={xOfIndex(hover)} y1={PAD.t} y2={volTop + volH} className="stroke-ink-3" strokeDasharray="3 3" />}
        </svg>
      )}
      {h && (
        <div className="num pointer-events-none absolute left-2 top-1 rounded-control bg-paper/90 px-2 py-1 text-caption text-ink-2 shadow-sm">
          {formatCandleTime(h.time, iv)} · O {price(h.open)} H {price(h.high)} L {price(h.low)} C {price(h.close)}
        </div>
      )}
    </div>
  );
}
