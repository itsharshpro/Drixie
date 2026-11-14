"use client";

import { FUND_IDS, FUND_SEEDS, type FundRow } from "@listed/shared";
import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { InView } from "../../v4/primitives";
import { useMemo } from "react";
import { BACKTEST_LABEL, backtestReturn, backtestSpark, fmtPct, fmtUsd, fmtUsdCompact, fundColor, liveTooThin, mandateWord } from "../data/logic";
import { useFundBacktests, useFunds } from "../data/queries";
import { Change, FundMark, LiveDot, Spark } from "../ui/atoms";

function Chip({ id, f, i, bt }: { id: string; f: FundRow | null; i: number; bt: { ret: number; spark: number[] } | null }) {
  const seed = FUND_SEEDS[id as keyof typeof FUND_SEEDS];
  return (
    <Link
      href={`/app/f/${id}`}
      className="v4-chip v4-reveal group relative flex min-w-[216px] flex-1 snap-start flex-col gap-3 overflow-hidden rounded-[18px] bg-paper p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-brand min-[1200px]:min-w-0"
      style={{ "--i": i, "--dot": fundColor(id) } as CSSProperties}
      aria-label={f ? `${f.name}: NAV ${fmtUsd(f.nav)}` : `${seed?.name ?? id}: no NAV yet`}
    >
      <span data-art aria-hidden className="v4-chip-dots pointer-events-none absolute inset-x-0 bottom-0 h-10" />
      <span className="relative flex items-center gap-2.5">
        <FundMark id={id} size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{f?.name ?? seed?.name}</span>
          <span className="truncate text-[11.5px] text-ink-3">{mandateWord(f?.mandate ?? seed?.mandate ?? "")}</span>
        </span>
        <span className="ml-auto">{f ? <Change value={f.ret1d} className="h-5 px-1.5 text-[10.5px]" /> : null}</span>
      </span>
      <span className="relative flex items-end justify-between gap-2">
        <span className="flex flex-col">
          <span className="v4-num text-[18px] font-medium leading-6 tracking-[-0.02em] text-ink">{f ? fmtUsd(f.nav) : seed ? fmtUsdCompact(seed.seedUsd) : "—"}</span>
          <span className="text-[11px] text-ink-3">
            {f?.premium !== null && f?.premium !== undefined ? (
              <>
                coin{" "}
                <span className={cn("v4-num", f.premium >= 0 ? "text-up" : "text-down")}>
                  {f.premium >= 0 ? "+" : "−"}
                  {Math.abs(f.premium).toFixed(1)}%
                </span>{" "}
                vs NAV
              </>
            ) : f ? (
              "NAV per coin"
            ) : (
              "manager stake"
            )}
          </span>
        </span>
        {bt ? (
          <span className="flex flex-col items-end gap-0.5" title={BACKTEST_LABEL}>
            <Spark id={id} values={bt.spark} width={76} height={28} />
            <span className="v4-num text-[10.5px] text-ink-3">
              <span className={bt.ret >= 0 ? "text-up" : "text-down"}>{fmtPct(bt.ret)}</span> since Nov 1
            </span>
          </span>
        ) : f ? (
          <Spark id={id} values={f.spark} width={76} height={28} />
        ) : null}
      </span>
    </Link>
  );
}

export function FundStrip() {
  const { funds, status } = useFunds();
  const byId = new Map(funds.map((f) => [f.id, f]));
  const key = (status === "live" ? funds.map((f) => f.id) : [...FUND_IDS]).join(",");
  const ids = useMemo(() => (key ? key.split(",") : []), [key]);
  const backtests = useFundBacktests(ids, "1h", status !== "loading" && status !== "offline");
  const btById = useMemo(() => {
    const sparks = new Map(funds.map((f) => [f.id, f.spark]));
    const m = new Map<string, { ret: number; spark: number[] }>();
    ids.forEach((id, i) => {
      const bt = backtests[i];
      const ret = backtestReturn(bt);
      if (bt && ret !== null && liveTooThin(sparks.get(id))) m.set(id, { ret, spark: backtestSpark(bt, 48) });
    });
    return m;
  }, [ids, backtests, funds]);
  return (
    <section className="v4-strip" aria-label="Live funds">
      <div className="v4-container">
        <InView className="flex flex-col items-center gap-4">
          <p className="v4-reveal flex items-center gap-2 text-[12.5px] text-ink-3">
            <LiveDot on={status === "live"} />
            {status === "live" ? "NAV per coin · coin price vs NAV · last 24 hours" : status === "offline" ? "The arena is offline right now" : "The five managers · NAV starts at $10.00"}
            {btById.size > 0 ? <span className="text-ink-3"> · lines: {BACKTEST_LABEL}</span> : null}
          </p>
          <div className="-mx-[var(--v4-pad)] flex w-[calc(100%+2*var(--v4-pad))] snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--v4-pad)] pb-2 [scrollbar-width:none] min-[1200px]:mx-0 min-[1200px]:grid min-[1200px]:w-full min-[1200px]:grid-cols-5 min-[1200px]:overflow-visible min-[1200px]:px-0 min-[1200px]:pb-0">
            {ids.map((id, i) => (
              <Chip key={id} id={id} f={byId.get(id) ?? null} i={i} bt={btById.get(id) ?? null} />
            ))}
          </div>
        </InView>
      </div>
    </section>
  );
}
