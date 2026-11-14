"use client";

import { Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSeason } from "@/lib/funds/queries";
import { Countdown } from "../bell/countdown";
import { PeriodBar } from "../bell/period-bar";
import { Card, CARD_TITLE } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";

const DEFAULT_BELL_SECS = 900;
const BELL_STEPS = [
  "Managers seal their new weights before the bell.",
  "At the bell every move is revealed at once.",
  "The NAV is posted with a hash of the real prices.",
  "Waiting buy-ins and cash-outs fill at that NAV.",
];

export function BellCard({ nextBellAt, lastBell, className }: { nextBellAt: string | null; lastBell: number | null; className?: string }) {
  const season = useSeason();
  const clock = season.data?.clock ?? null;
  const bellSecs = clock?.bellSecs ?? DEFAULT_BELL_SECS;
  const perQuarter = clock ? Math.max(1, Math.round(clock.quarterSecs / clock.bellSecs)) : 96;
  const bell = clock?.bell ?? lastBell;
  return (
    <Card as="section" aria-labelledby="fund-bell-h" className={cn("flex flex-col p-5 md:p-6", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold-text" aria-hidden>
          <Bell className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 id="fund-bell-h" className={CARD_TITLE}>
            Next <Term id="rebalance-bell">rebalance bell</Term>
          </h2>
          <p className="truncate text-caption text-ink-3">Every manager&apos;s sealed moves go public together.</p>
        </div>
      </div>
      <Countdown to={nextBellAt} className="mt-4 text-display-sm font-semibold tracking-[-0.02em]" />
      <PeriodBar to={nextBellAt} periodMs={bellSecs * 1000} className="mt-3" />
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-caption">
        <div className="min-w-0">
          <dt className="text-ink-3">Bell</dt>
          <dd className="num text-body-sm font-medium text-ink">{bell ?? "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-3">
            <Term id="season">Quarter</Term>
          </dt>
          <dd className="num text-body-sm font-medium text-ink">{clock ? `${clock.quarter} of ${clock.quarters}` : "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-3">Season</dt>
          <dd className="num text-body-sm font-medium text-ink">{clock ? clock.season : "—"}</dd>
        </div>
      </dl>
      <ol className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        {BELL_STEPS.map((t, i) => (
          <li key={t} className="flex items-start gap-3 text-body-sm text-ink-2">
            <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-fill text-[11px] font-semibold text-ink-2">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <p className="mt-auto pt-4 text-caption text-ink-3">
        A bell every {Math.round(bellSecs / 60)} minutes, {perQuarter} a quarter. Buy-ins and cash-outs fill at the NAV posted right after it.
      </p>
    </Card>
  );
}

export function BellCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("flex flex-col p-5 md:p-6", className)} aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 w-28 rounded-control" />
      <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
      <Skeleton className="mt-4 h-10 w-full" />
      <Skeleton className="mt-4 h-3 w-56" />
    </Card>
  );
}
