"use client";

import { useMemo, useState } from "react";
import type { Candle } from "@/components/trading";
import { cn } from "@/lib/cn";
import { LandingCandles, type CandleOverlay } from "../../v4/charts/landing-candles";
import { fillForward } from "../../v4/charts/candle-logic";
import {
  BACKTEST_INTERVALS,
  BACKTEST_LABEL,
  backtestCandles,
  backtestSpy,
  fmtPct,
  fmtUsd,
  fundColor,
  type BacktestInterval,
  type FundBacktest,
} from "../data/logic";

const STEP: Record<BacktestInterval, number> = { "1h": 3600, "1d": 86400 };

export function BacktestChip({ label, className }: { label?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full bg-[color-mix(in_oklab,var(--brand)_8%,transparent)] px-2 text-[11px] font-medium text-brand",
        className,
      )}
      title="The fund's basket valued with real historical prices, normalized to $10.00 on Nov 1. Not live trading."
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M1 8.5h8M2 6.5l2-2 1.6 1.4L8.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label || BACKTEST_LABEL}
    </span>
  );
}

function BacktestTabs({ value, onChange }: { value: BacktestInterval; onChange: (v: BacktestInterval) => void }) {
  return (
    <div className="inline-flex h-7 items-center rounded-[8px] bg-fill p-0.5" role="tablist" aria-label="Backtest interval">
      {BACKTEST_INTERVALS.map((iv) => {
        const on = iv === value;
        return (
          <button
            key={iv}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(iv)}
            className={cn(
              "v4-num h-6 min-w-[34px] rounded-[6px] px-2 text-[11.5px] font-medium transition-colors duration-150",
              on ? "bg-paper text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {iv}
          </button>
        );
      })}
    </div>
  );
}

export interface BacktestChartProps {
  fundId: string;
  fundName: string;
  backtest: FundBacktest | null;
  interval: BacktestInterval;
  onInterval: (v: BacktestInterval) => void;
  height: number;
  loading?: boolean;
}

export function BacktestChart({ fundId, fundName, backtest, interval, onInterval, height, loading }: BacktestChartProps) {
  const [hover, setHover] = useState<Candle | null>(null);

  const candles = useMemo<Candle[]>(() => fillForward(backtestCandles(backtest), STEP[interval], 2400), [backtest, interval]);
  const spy = useMemo(() => backtestSpy(backtest), [backtest]);

  const { overlays, sameScale } = useMemo(() => {
    const out: CandleOverlay[] = [];
    if (spy.length < 2 || candles.length < 2) return { overlays: out, sameScale: false };
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const span = hi - lo;
    const plotH = height - 20 - 2 * Math.max(4, Math.round(height * 0.08));
    const inset = plotH > 8 && span > 0 ? (4 * span) / plotH : 0;
    const aLo = lo + inset;
    const aHi = hi - inset;
    const t0 = spy[0]!.t;
    const inside = spy.every((p) => p.v >= aLo && p.v <= aHi);
    if (inside && aHi > aLo) out.push({ id: "scale", points: [{ t: t0, v: aLo }, { t: t0, v: aHi }], color: "transparent" });
    out.push({ id: "spy", points: spy, color: "var(--ink-3)", dashed: true });
    return { overlays: out, sameScale: inside };
  }, [spy, candles, height]);

  const first = candles[0] ?? null;
  const shown = hover ?? candles[candles.length - 1] ?? null;
  const ret = first && shown && first.open > 0 ? (shown.close / first.open - 1) * 100 : null;
  const lastC = candles[candles.length - 1] ?? null;
  const totalRet = first && lastC && first.open > 0 ? (lastC.close / first.open - 1) * 100 : null;
  const spyLast = spy.length ? spy[spy.length - 1]!.v : null;
  const spyRet = spyLast !== null && spy[0] && spy[0].v > 0 ? (spyLast / spy[0].v - 1) * 100 : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-2 pb-1.5 md:px-3">
        <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-ink-3">
          <BacktestChip label={backtest?.label} />
          {shown ? (
            <span className="v4-num hidden items-center gap-2 sm:inline-flex">
              <span>C <span className="text-ink-2">{fmtUsd(shown.close)}</span></span>
              <span className={cn("font-medium", (ret ?? 0) >= 0 ? "text-up" : "text-down")}>{fmtPct(ret, 2)}</span>
            </span>
          ) : null}
        </div>
        <BacktestTabs value={interval} onChange={onInterval} />
      </div>
      <LandingCandles
        candles={candles}
        interval="1D"
        height={height}
        minSlots={Math.max(14, candles.length)}
        axis
        grid
        lastLine
        timeAxis
        overlays={overlays}
        loading={loading}
        onHover={setHover}
        animateKey={`bt-${fundId}-${interval}`}
        watermark={fundName.toUpperCase()}
        label={`${fundName} basket backtest on real prices since Nov 1, ${interval} candles, with SPY`}
        empty={
          <div className="grid h-full place-items-center rounded-[12px] border border-dashed border-line text-[12.5px] text-ink-3">
            Historical prices for this basket are not in yet.
          </div>
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-1 text-[11px] text-ink-3 md:px-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[3px] rounded-[1px]" style={{ background: fundColor(fundId) }} /> {fundName} basket <span className={cn("v4-num", (totalRet ?? 0) >= 0 ? "text-up" : "text-down")}>{fmtPct(totalRet, 2)}</span>
        </span>
        {spy.length > 1 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-3 border-t-[1.5px] border-dashed border-ink-3" /> SPY <span className="v4-num text-ink-2">{fmtPct(spyRet, 2)}</span>
            {sameScale ? null : <span>(own scale)</span>}
          </span>
        ) : null}
        <span className="ml-auto">
          {backtest?.weightsSource === "on-chain" ? "Current on-chain weights" : "Mandate's default 10 holdings"} · $10.00 on Nov 1 · live coin takes over as it trades
        </span>
      </div>
    </div>
  );
}
