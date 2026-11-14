"use client";

import type { FundRow } from "@listed/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { toCandles } from "@/lib/funds/candles";
import { fundCharacter } from "@/lib/funds/character";
import { price } from "@/lib/funds/format";
import { fundColorVar, fundPastelVar } from "@/lib/funds/meta";
import { fundQuery, useFundCandles } from "@/lib/funds/queries";
import { useInView } from "@/lib/hooks/use-in-view";
import { Halftone, halftoneHost } from "../trading/halftone";
import { MiniCandles } from "../trading/mini-candles";
import { ChangeChip } from "../ui/change-chip";
import { RiskBadge } from "../ui/fund-chips";
import { FundMark } from "../ui/fund-mark";
import { NumberRoll } from "../ui/number-roll";
import { ReputationGauge } from "../ui/reputation-gauge";
import { NAV } from "../ui/transitions";
import { VividFlash } from "./vivid-flash";

const FORWARD = [...NAV.forward];

export function FundTile({ f, match = false, dim = false, className }: { f: FundRow; match?: boolean; dim?: boolean; className?: string }) {
  const [ref, seen] = useInView<HTMLAnchorElement>("240px");
  const qc = useQueryClient();
  const q = useFundCandles(f.id, "15m", seen);
  const candles = useMemo(() => toCandles(q.data?.candles).slice(-24), [q.data]);
  const who = fundCharacter(f.id, f.mandate);
  const color = fundColorVar(f.id);
  const hasCoin = f.coinPrice !== null && Number.isFinite(f.coinPrice);
  const shown = hasCoin ? (f.coinPrice as number) : f.nav;
  const warm = () => void qc.prefetchQuery(fundQuery(f.id));

  return (
    <Link
      ref={ref}
      href={`/app/f/${f.id}`}
      transitionTypes={FORWARD}
      onPointerEnter={warm}
      onFocus={warm}
      aria-label={`${f.name}, ${who.personality}. Open the fund`}
      className={cn(
        halftoneHost,
        "group relative flex h-full min-w-0 flex-col gap-3 overflow-hidden rounded-[20px] border border-line p-4 pb-5 text-left shadow-e1 outline-none",
        "transition-[transform,box-shadow,opacity] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-1 hover:shadow-e2 active:scale-[0.98] active:duration-[120ms]",
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0",
        match && "outline-2 outline-offset-2",
        dim && "opacity-45 hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
      style={{ background: fundPastelVar(f.id), outlineColor: match ? color : undefined }}
    >
      <Halftone className="pointer-events-none absolute inset-x-0 bottom-0" rows={5} cell={8} color={color} opacity={0.28} />

      <div className="relative flex min-w-0 items-start gap-3">
        <FundMark fund={f.id} size={40} className="transition-transform duration-200 group-hover:scale-105" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold tracking-[-0.01em] text-ink">{f.name}</p>
          <p className="truncate text-caption text-ink-2">{who.personality}</p>
        </div>
      </div>

      <div className="relative flex min-w-0 flex-wrap items-center gap-2">
        <RiskBadge fund={f.id} mandate={f.mandate} short />
        {f.status !== "active" && <span className="text-caption font-medium text-ink-2">{f.status === "autopilot" ? "On autopilot" : "Liquidated"}</span>}
      </div>

      <div className="relative flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-caption text-ink-2">{hasCoin ? "Coin" : "NAV"}</p>
          <VividFlash value={shown}>
            <NumberRoll value={price(shown)} className="text-title-sm font-semibold tracking-[-0.01em] text-ink" label={`${f.name} ${hasCoin ? "coin" : "NAV"} ${price(shown)}`} />
          </VividFlash>
        </div>
        <ChangeChip value={f.ret1d} size="sm" />
      </div>

      <div className="relative rounded-[12px] border border-line bg-paper p-2">
        <MiniCandles
          candles={candles}
          count={24}
          height={48}
          interval="5m"
          tooltip={false}
          focusable={false}
          loading={!seen || (!q.data && q.isPending)}
          emptyLabel="No candles yet"
          label={`${f.name} coin, 15-minute candles`}
        />
      </div>

      <div className="relative mt-auto flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <ReputationGauge score={f.reputation} size={40} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="num text-body-sm font-semibold text-ink">{Math.round(f.reputation)}</span>
            <span className="truncate text-caption text-ink-2">Reputation</span>
          </span>
        </span>
        {match ? (
          <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-ink px-3 text-caption font-medium text-paper">
            Buy in <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
          </span>
        ) : (
          <ArrowRight className="size-4 shrink-0 text-ink-3 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.5} aria-hidden />
        )}
      </div>
    </Link>
  );
}

export function FundTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-[20px] border border-line bg-paper p-4", className)} aria-hidden>
      <div className="flex items-center gap-3">
        <div className="skeleton size-10 rounded-[10px]" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="skeleton h-3.5 w-20 rounded-full" />
          <div className="skeleton h-3 w-28 rounded-full" />
        </div>
      </div>
      <div className="skeleton h-6 w-20 rounded-full" />
      <div className="skeleton h-7 w-24 rounded-full" />
      <div className="skeleton h-[66px] w-full rounded-[12px]" />
      <div className="skeleton h-10 w-28 rounded-full" />
    </div>
  );
}
