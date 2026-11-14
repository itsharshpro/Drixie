"use client";

import type { RiskProfileId } from "@listed/shared";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/funds/format";
import { useSavedProfile } from "@/lib/funds/local";
import { useFunds } from "@/lib/funds/queries";
import { useIsPhone } from "@/lib/hooks/use-media";
import { Card, CARD_TITLE } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { PageHeader } from "../ui/page-header";
import { LoadingRegion, Skeleton } from "../ui/skeleton";
import { Reveal } from "../ui/transitions";
import { BellCard, BellCardSkeleton } from "./bell-card";
import { FeedList, FeedMoreLink, FeedSkeleton } from "./feed-list";
import { FundTile, FundTileSkeleton } from "./fund-tile";
import { FundsTable, FundsTableSkeleton } from "./funds-table";
import { matchesFor, RiskPicker } from "./risk-picker";

const RAIL = "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-12 lg:gap-6";

const ARENA = "flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-6 md:overflow-visible md:pb-0 lg:grid-cols-5 lg:gap-4";
const cell = (i: number) => cn("w-[78%] max-w-[300px] shrink-0 snap-start md:w-auto md:max-w-none lg:col-span-1", i < 3 ? "md:col-span-2" : "md:col-span-3");

export function FundsScreen() {
  const funds = useFunds();
  const phone = useIsPhone();
  const saved = useSavedProfile();

  const [picked, setPicked] = useState<RiskProfileId | "none" | null>(null);
  const risk: RiskProfileId | null = picked === "none" ? null : (picked ?? saved?.profile ?? null);
  const rows = useMemo(() => funds.data?.items ?? [], [funds.data]);
  const matches = useMemo(() => matchesFor(rows, risk), [rows, risk]);

  return (
    <>
      <PageHeader title="Funds" subtitle="Five AI managers. Back one." back={false} />
      {funds.isError && !funds.data ? (
        <div className="pt-10">
          <ErrorState error={funds.error} onRetry={() => funds.refetch()} retrying={funds.isRefetching} />
        </div>
      ) : (
        <Reveal ready={!!funds.data} fallback={<FundsSkeleton />}>
          {() => {
            const d = funds.data!;
            const empty = d.waiting || rows.length === 0;
            return (
              <div className="flex flex-col gap-4 lg:gap-6">
                {!empty && <RiskPicker rows={rows} value={risk} onChange={(v) => setPicked(v ?? "none")} />}
                {empty ? (
                  <Card>
                    <EmptyState
                      icon="market"
                      title="The arena opens soon"
                      body="The five funds appear here as soon as the funds contract is live and the first NAV is posted. Meanwhile, browse the stocks they can hold."
                      action={{ label: "Browse the stocks", href: "/app/stocks" }}
                    />
                  </Card>
                ) : (
                  <>
                    <section aria-label="The five funds" className={ARENA}>
                      {rows.map((f, i) => (
                        <div key={f.id} className={cell(i)}>
                          <FundTile f={f} match={matches.has(f.id)} dim={risk !== null && !matches.has(f.id)} />
                        </div>
                      ))}
                    </section>
                    <Card as="section" id="funds" aria-labelledby="funds-h" className="@container scroll-mt-24 overflow-hidden">
                      <div className="flex min-w-0 flex-col gap-0.5 px-5 pb-4 pt-5 md:px-6 md:pt-6">
                        <h2 id="funds-h" className={CARD_TITLE}>
                          Compare
                        </h2>
                        <p className="text-caption text-ink-3">
                          Priced off real markets. SPY this season:{" "}
                          <span className={cn("num", (d.spySeason ?? 0) >= 0 ? "text-ink-2" : "text-down")}>{pct(d.spySeason)}</span>
                        </p>
                      </div>
                      <FundsTable rows={rows} phone={phone} />
                    </Card>
                  </>
                )}
                <aside aria-label="Bell and moves" className={RAIL}>
                  <BellCard nextBellAt={d.nextBellAt} lastBell={d.lastBell} className="md:col-span-5 lg:col-span-4" />
                  <Card as="section" aria-labelledby="moves-h" className="flex min-w-0 flex-col px-5 pb-2 pt-5 md:col-span-7 md:px-6 md:pt-6 lg:col-span-8">
                    <div className="flex min-h-11 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 id="moves-h" className={CARD_TITLE}>
                          Live moves
                        </h2>
                        <p className="truncate text-caption text-ink-3">Reveals, raids and reputation, as they happen</p>
                      </div>
                      <FeedMoreLink />
                    </div>
                    <FeedList
                      kinds={["move", "raid", "reputation", "flow"]}
                      first={5}
                      empty={{ title: "No moves yet", body: "The first reveal lands right after the next rebalance bell." }}
                    />
                  </Card>
                </aside>
              </div>
            );
          }}
        </Reveal>
      )}
    </>
  );
}

function FundsSkeleton() {
  return (
    <LoadingRegion label="Loading the funds" className="flex flex-col gap-4 lg:gap-6">
      <Card className="flex flex-col gap-3 px-5 py-5 md:flex-row md:items-center md:px-6">
        <Skeleton className="h-4 w-24" />
        <div className="grid flex-1 grid-cols-3 gap-2">
          <Skeleton className="h-11 rounded-full" />
          <Skeleton className="h-11 rounded-full" />
          <Skeleton className="h-11 rounded-full" />
        </div>
      </Card>
      <div className={ARENA}>
        {Array.from({ length: 5 }, (_, i) => (
          <FundTileSkeleton key={i} className={cell(i)} />
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 px-5 pb-4 pt-5 md:px-6 md:pt-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-56" />
        </div>
        <FundsTableSkeleton />
      </Card>
      <div className={RAIL}>
        <BellCardSkeleton className="md:col-span-5 lg:col-span-4" />
        <Card className="px-5 pb-3 pt-5 md:col-span-7 md:px-6 lg:col-span-8">
          <Skeleton className="h-4 w-28" />
          <FeedSkeleton rows={5} />
        </Card>
      </div>
    </LoadingRegion>
  );
}
