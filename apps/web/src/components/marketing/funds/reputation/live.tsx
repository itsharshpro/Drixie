"use client";

import { FUND_IDS, FUND_SEEDS, type ReputationHistory } from "@listed/shared";
import { useQueries } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { getJson } from "../../lib/api";
import { useReducedMotionSafe } from "../../v4/primitives";
import { fundColor, fundPastel } from "../data/logic";
import { FK, useFunds } from "../data/queries";
import { FundMark } from "../ui/atoms";
import { fmtScore, RepGauge } from "./gauge";
import { kindLabel } from "./story";

function useRepHistories(enabled: boolean) {
  return useQueries({
    queries: FUND_IDS.map((id) => ({
      queryKey: [...FK.all, "reputation", id] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => getJson<ReputationHistory>(`/funds/${encodeURIComponent(id)}/reputation`, { signal }),
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      staleTime: 30_000,
      retry: false,
      enabled,
    })),
  });
}

export function RepLive() {
  const { funds, status } = useFunds();
  const live = status === "live";
  const reduced = useReducedMotionSafe();
  const hist = useRepHistories(live);
  return (
    <div className="mx-auto mt-14 max-w-[1040px] md:mt-20">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h3 className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.02em] text-ink md:text-[22px]">
          <span className={cn("relative flex size-2", live ? "" : "opacity-40")}>
            {live && !reduced ? <span className="absolute inset-0 animate-ping rounded-full bg-candle-up opacity-60" /> : null}
            <span className="relative size-2 rounded-full bg-candle-up" />
          </span>
          Live right now
        </h3>
        <p className="text-[13.5px] text-ink-3">
          {live ? "The five arena funds, scored by the same rules." : status === "offline" ? "Scores show when the arena is reachable." : "Every fund starts at 60 when the season opens."}
        </p>
      </div>
      <ul className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-5 md:gap-3 [&>li:last-child]:col-span-2 md:[&>li:last-child]:col-span-1">
        {FUND_IDS.map((id, i) => {
          const f = funds.find((r) => r.id === id) ?? null;
          const score = live ? (f?.reputation ?? null) : null;
          const ev = hist[i]?.data?.events?.filter((e) => e.kind !== "anchor").sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
          const zone = score === null ? "none" : score < 25 ? "red" : score < 40 ? "amber" : "ok";
          return (
            <li
              key={id}
              className="flex min-w-0 flex-col rounded-[20px] p-3 shadow-[0_0_0_1px_var(--line)] md:p-3.5"
              style={{ background: `color-mix(in oklab, ${fundPastel(id)} 26%, #fff)` }}
            >
              <div className="flex items-center gap-2">
                <FundMark id={id} size={24} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{f?.name ?? FUND_SEEDS[id].name}</span>
                <span
                  className={cn(
                    "v4-num text-[15px] font-semibold tracking-[-0.02em]",
                    zone === "red" ? "text-down" : zone === "amber" ? "text-gold-text" : zone === "ok" ? "text-ink" : "text-ink-3",
                  )}
                >
                  {score === null ? "–" : fmtScore(Math.round(score * 10) / 10)}
                </span>
              </div>
              <RepGauge
                score={score}
                color={fundColor(id)}
                size="sm"
                reduced={reduced}
                label={score === null ? `${FUND_SEEDS[id].name}: no score yet` : `${f?.name ?? id} reputation ${fmtScore(score)} out of 100`}
                className="mt-2 max-w-[150px]"
              />
              <div className="mt-2.5 min-h-[38px] rounded-[12px] bg-paper/75 px-2.5 py-2 text-[11.5px] leading-[16px]">
                {ev ? (
                  <>
                    <span className={cn("v4-num mr-1 font-semibold", ev.delta >= 0 ? "text-up" : "text-down")}>
                      {kindLabel(ev.kind)} {ev.delta >= 0 ? "+" : "−"}
                      {fmtScore(Math.abs(ev.delta))}
                    </span>
                    <span className="line-clamp-2 text-ink-2">{ev.reason}</span>
                  </>
                ) : f && live ? (
                  <span className="text-ink-2">
                    Outsiders hold <span className="v4-num font-semibold text-ink">{f.outsideHolders.toFixed(1)}%</span> of its coin
                  </span>
                ) : (
                  <span className="text-ink-3">{FUND_SEEDS[id].mandateLine}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
