"use client";

import type { FundCandleInterval } from "@listed/shared";
import { useMemo, useState } from "react";
import type { Candle } from "@/components/trading";
import { cn } from "@/lib/cn";
import { LandingCandles, type CandleOverlay } from "../charts/landing-candles";
import { fmtUsd, fundColor, type LineSeries } from "../../funds/data/logic";

export const HERO_INTERVALS = ["5m", "15m", "1h"] as const satisfies readonly FundCandleInterval[];
export type HeroInterval = (typeof HERO_INTERVALS)[number];

export function PremiumChip({ premium, className }: { premium: number | null | undefined; className?: string }) {
  if (premium === null || premium === undefined || !Number.isFinite(premium)) return null;
  const up = premium >= 0;
  return (
    <span
      className={cn("v4-num inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-medium", up ? "bg-up-soft text-up" : "bg-down-soft text-down", className)}
      title="Coin pool price versus NAV"
    >
      {up ? "+" : "−"}
      {Math.abs(premium).toFixed(1)}% {up ? "premium" : "discount"}
    </span>
  );
}

export function IntervalTabs({ value, onChange }: { value: HeroInterval; onChange: (v: HeroInterval) => void }) {
  return (
    <div className="inline-flex h-7 items-center rounded-[8px] bg-fill p-0.5" role="tablist" aria-label="Candle interval">
      {HERO_INTERVALS.map((iv) => {
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

const toApiInterval = (iv: HeroInterval) => (iv === "1h" ? "1h" : "5m") as "1h" | "5m";

export interface HeroCoinChartProps {
  fundId: string;
  fundName: string;
  candles: readonly Candle[];
  interval: HeroInterval;
  onInterval: (v: HeroInterval) => void;
  height: number;
  loading?: boolean;
  coinPrice: number | null;
  premium: number | null;

  nav?: LineSeries | null;
  spy?: LineSeries | null;
}

export function HeroCoinChart({ fundId, fundName, candles, interval, onInterval, height, loading, coinPrice, premium, nav, spy }: HeroCoinChartProps) {
  const [hover, setHover] = useState<Candle | null>(null);
  const overlays = useMemo(() => {
    const out: CandleOverlay[] = [];
    const sec = (s: LineSeries) => s.points.map((p) => ({ t: Math.floor(p.t / 1000), v: p.v }));
    if (spy?.points.length) out.push({ id: "spy", points: sec(spy), color: "var(--ink-3)", dashed: true });
    if (nav?.points.length) out.push({ id: "nav", points: sec(nav), color: fundColor(fundId) });
    return out;
  }, [nav, spy, fundId]);
  const shown = hover ?? (candles.length ? candles[candles.length - 1]! : null);
  const chg = shown && shown.open > 0 ? ((shown.close - shown.open) / shown.open) * 100 : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-2 pb-1.5 md:px-3">
        <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-ink-3">
          <span className="truncate font-medium text-ink-2">{fundName} coin</span>
          {shown ? (
            <span className="v4-num hidden items-center gap-2 sm:inline-flex">
              <span>O <span className="text-ink-2">{fmtUsd(shown.open)}</span></span>
              <span>H <span className="text-ink-2">{fmtUsd(shown.high)}</span></span>
              <span>L <span className="text-ink-2">{fmtUsd(shown.low)}</span></span>
              <span>C <span className={cn((chg ?? 0) >= 0 ? "text-up" : "text-down")}>{fmtUsd(shown.close)}</span></span>
            </span>
          ) : coinPrice !== null ? (
            <span className="v4-num text-ink-2">{fmtUsd(coinPrice)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <PremiumChip premium={premium} />
          <IntervalTabs value={interval} onChange={onInterval} />
        </div>
      </div>
      <LandingCandles
        candles={candles}
        interval={toApiInterval(interval)}
        height={height}
        spacing={9}
        minSlots={40}
        axis
        grid
        volume
        lastLine
        liveDot
        timeAxis
        overlays={overlays}
        loading={loading}
        onHover={setHover}
        animateKey={`${fundId}-${interval}`}
        watermark={fundName.toUpperCase()}
        label={`${fundName} coin candles, ${interval}`}
        empty={
          <div className="grid h-full place-items-center rounded-[12px] border border-dashed border-line text-[12.5px] text-ink-3">The coin pool has not traded yet.</div>
        }
      />
      {overlays.length ? (
        <div className="flex shrink-0 items-center gap-3 px-2 pt-1 text-[11px] text-ink-3 md:px-3">
          {nav?.points.length ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[2px] w-3 rounded-full" style={{ background: fundColor(fundId) }} /> NAV
            </span>
          ) : null}
          {spy?.points.length ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-3 border-t-[1.5px] border-dashed border-ink-3" /> SPY
            </span>
          ) : null}
          <span className="ml-auto">Lines: return on their own scale</span>
        </div>
      ) : null}
    </div>
  );
}
