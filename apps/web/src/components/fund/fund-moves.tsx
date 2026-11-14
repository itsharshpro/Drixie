"use client";

import type { Move } from "@listed/shared";
import { Quote } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { fundColorVar } from "@/lib/funds/meta";
import { useMoves } from "@/lib/funds/queries";
import { useNow } from "@/lib/hooks/use-now";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { MoveChip } from "../ui/fund-chips";
import { LoadMore } from "../ui/load-more";
import { Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { TimeAgo } from "../ui/time-ago";
import { AnimatedItem, AnimatedList, NAV } from "../ui/transitions";
import { VerifyLink } from "../ui/verify-link";

function MoveStop({ move, now, color }: { move: Move; now: number | null; color: string }) {
  const diffs = move.diffs.filter((d) => d.kind !== "same").sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return (
    <article className="relative flex flex-col gap-2.5 py-4 pl-6">
      <span aria-hidden className="absolute left-[3px] top-0 h-full w-px bg-line" />
      <span aria-hidden className="absolute left-0 top-[22px] size-[7px] rounded-full ring-2 ring-paper" style={{ background: color }} />
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-3">
        <span className="num font-medium text-ink">Bell {move.bell}</span>
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
            <li key={d.asset} title={d.name}>
              <MoveChip asset={d.asset} deltaBps={d.delta} kind={d.kind} />
            </li>
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

export function FundMoves({ fund, className }: { fund: string; className?: string }) {
  const q = useMoves(fund);
  const now = useNow(30_000);
  const moves = q.data?.pages.flatMap((p) => p.items) ?? [];
  const color = fundColorVar(fund);
  return (
    <Card as="section" id="moves" aria-labelledby="fund-moves-h" className={cn("scroll-mt-24", className)}>
      <CardHeader id="fund-moves-h" title="Moves and manager notes" subtitle="Every bell, weight by weight, newest first" meta={<Term id="commit-reveal">How reveals work</Term>} />
      <div className="px-5 pb-4 md:px-6">
        {q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} compact />
        ) : !q.data ? (
          <div className="flex flex-col gap-4 pt-4" aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-6 w-3/4 rounded-full" />
                <Skeleton className="h-10 w-full rounded-control" />
              </div>
            ))}
          </div>
        ) : moves.length === 0 ? (
          <EmptyState icon="activity" title="No moves yet" body="The manager seals its first weights before a bell and reveals them right after it." compact />
        ) : (
          <>
            <AnimatedList as="ul" className="flex flex-col" aria-live="polite">
              {moves.map((m, i) => (
                <AnimatedItem as="li" key={m.id} index={i}>
                  <MoveStop move={m} now={now} color={color} />
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
