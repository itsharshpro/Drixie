"use client";

import type { Move, WeightDiff } from "@listed/shared";
import { ArrowDownRight, ArrowUpRight, LogIn, LogOut, Quote } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { bps, bpsDelta } from "@/lib/funds/format";
import { useMoves } from "@/lib/funds/queries";
import { formatDateTime } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { LoadMore } from "../ui/load-more";
import { Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { TimeAgo } from "../ui/time-ago";
import { AnimatedItem, AnimatedList, NAV } from "../ui/transitions";
import { VerifyLink } from "../ui/verify-link";

const KIND = {
  enter: { icon: LogIn, cls: "bg-up-soft text-up", word: "In" },
  exit: { icon: LogOut, cls: "bg-down-soft text-down", word: "Out" },
  up: { icon: ArrowUpRight, cls: "bg-up-soft text-up", word: "Up" },
  down: { icon: ArrowDownRight, cls: "bg-down-soft text-down", word: "Down" },
  same: { icon: ArrowUpRight, cls: "bg-fill text-ink-2", word: "Same" },
} as const;

function DiffChip({ d }: { d: WeightDiff }) {
  const k = KIND[d.kind];
  const Icon = k.icon;
  const title = `${d.name}: ${bps(d.before)} → ${bps(d.after)}`;
  return (
    <li title={title} className={cn("inline-flex h-7 items-center gap-1.5 rounded-chip px-2 text-caption font-medium", k.cls)}>
      <Icon className="size-3.5" aria-hidden />
      <span className="num">{d.asset}</span>
      <span className="num">{d.kind === "enter" ? bps(d.after) : d.kind === "exit" ? bps(d.before) : bpsDelta(d.delta)}</span>
      <span className="sr-only">
        {k.word}: {title}
      </span>
    </li>
  );
}

export function MoveItem({ move, now, showFund = false }: { move: Move; now: number | null; showFund?: boolean }) {
  const diffs = move.diffs.filter((d) => d.kind !== "same").sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return (
    <article className="flex flex-col gap-3 py-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-3">
        <span className="num font-medium text-ink">Bell {move.bell}</span>
        {showFund && <span className="font-medium text-ink-2">{move.fundName}</span>}
        <span title={formatDateTime(move.at)}>
          <TimeAgo at={move.at} now={now} fixed={false} />
        </span>
        <span>
          <Term id="churn">Turnover</Term> <span className="num text-ink-2">{move.turnoverPct.toFixed(1)}%</span>
        </span>
        {move.edition !== null && (
          <Link href="/app/gallery" transitionTypes={[...NAV.lateral]} className="-my-3 inline-flex min-h-11 items-center font-medium text-brand hover:underline">
            Card #{move.edition}
          </Link>
        )}
        <VerifyLink txHash={move.txHash} className="ml-auto" />
      </header>
      {diffs.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Weight changes">
          {diffs.map((d) => (
            <DiffChip key={d.asset} d={d} />
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-ink-2">Kept the same weights.</p>
      )}
      {move.note && (
        <blockquote className="flex gap-2 rounded-control bg-fill px-3 py-2.5 text-body-sm text-ink">
          <Quote className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
          <p className="min-w-0">{move.note}</p>
        </blockquote>
      )}
    </article>
  );
}

export function MovesTimeline({ fund, className }: { fund: string; className?: string }) {
  const q = useMoves(fund);
  const now = useNow(30_000);
  const moves = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card as="section" id="moves" aria-labelledby="moves-tl-h" className={cn("scroll-mt-24", className)}>
      <CardHeader id="moves-tl-h" title="Moves and manager notes" subtitle="Every reveal, weight by weight, newest first" meta={<Term id="commit-reveal">How reveals work</Term>} />
      <div className="px-5 pb-4 md:px-6">
        {q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} compact />
        ) : !q.data ? (
          <div className="flex flex-col gap-4 pt-4" aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-7 w-3/4 rounded-chip" />
                <Skeleton className="h-10 w-full rounded-control" />
              </div>
            ))}
          </div>
        ) : moves.length === 0 ? (
          <EmptyState icon="activity" title="No moves yet" body="The manager seals its first weights before a bell and reveals them right after it." compact />
        ) : (
          <>
            <AnimatedList as="ul" className="flex flex-col divide-y divide-line" aria-live="polite">
              {moves.map((m, i) => (
                <AnimatedItem as="li" key={m.id} index={i}>
                  <MoveItem move={m} now={now} />
                </AnimatedItem>
              ))}
            </AnimatedList>
            <LoadMore onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} hasMore={q.hasNextPage} label="Show older moves" />
          </>
        )}
      </div>
    </Card>
  );
}
