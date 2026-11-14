"use client";

import type { FundDetail } from "@listed/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { pct, pp, price, usd } from "@/lib/funds/format";
import { MANDATE_LABEL, STATUS_LABEL } from "@/lib/funds/meta";
import { savePickedFund } from "@/lib/funds/local";
import { useFund, useFunds } from "@/lib/funds/queries";
import { ApiError } from "@/lib/api/client";
import { AccountCta } from "../ui/account-cta";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { HScroll } from "../ui/hscroll";
import { PageHeader } from "../ui/page-header";
import { LoadingRegion, Skeleton } from "../ui/skeleton";
import { KpiGrid, StatTile, StatTileSkeleton } from "../ui/stat-tile";
import { Term } from "../ui/term";
import { Reveal, SharedElement, transition } from "../ui/transitions";
import { BrainChip, PremiumTag, ReputationBadge } from "./bits";
import { BrainCard, HoldersCard, PromiseCard, ReputationCard, SeatCard, SideCardSkeleton } from "./fund-cards";
import { CoinCandlesChart, FundChartsSkeleton, NavVsSpyChart } from "./fund-charts";
import { FundMark } from "./fund-mark";
import { HoldingsCard } from "./holdings";
import { MovesTimeline } from "./moves-timeline";
import { OrderSheet } from "./order-sheet";
import { TradeSheet } from "./trade-sheet";

type SheetName = "buy" | "sell" | "trade";
const asSheet = (v: string | null): SheetName | null => (v === "buy" || v === "sell" || v === "trade" ? v : null);

const ANCHORS = [
  { id: "chart", label: "Charts" },
  { id: "holdings", label: "Holdings" },
  { id: "moves", label: "Moves" },
  { id: "reputation", label: "Reputation" },
  { id: "promise", label: "Promise" },
  { id: "seat", label: "Seat" },
] as const;

export function FundScreen({ id }: { id: string }) {
  const fundId = id.toLowerCase();
  const q = useFund(fundId);
  const funds = useFunds();
  const row = funds.data?.items.find((f) => f.id === fundId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => savePickedFund(fundId), [fundId]);

  const urlSheet = asSheet(params.get("sheet"));
  const [seenUrlSheet, setSeenUrlSheet] = useState(urlSheet);
  const [sheet, setSheetState] = useState<SheetName | null>(urlSheet);
  if (urlSheet !== seenUrlSheet) {
    setSeenUrlSheet(urlSheet);
    setSheetState(urlSheet);
  }
  const setSheet = useCallback(
    (next: SheetName | null) => {
      setSheetState(next);
      const sp = new URLSearchParams(params.toString());
      if (next) sp.set("sheet", next);
      else sp.delete("sheet");
      const qs = sp.toString();
      transition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );

  const notFound = q.error instanceof ApiError && q.error.isNotFound;
  const name = q.data?.name ?? row?.name ?? fundId.charAt(0).toUpperCase() + fundId.slice(1);
  const d = q.data;

  return (
    <>
      <PageHeader
        leading={
          <SharedElement kind="fund-mark" id={fundId}>
            <FundMark fund={fundId} size={56} />
          </SharedElement>
        }
        eyebrow={d ? `AI fund · ${MANDATE_LABEL[d.mandate]}` : "AI fund"}
        title={
          <SharedElement kind="fund-name" id={fundId}>
            <span>{name}</span>
          </SharedElement>
        }
        subtitle={d?.mandateLine ?? row?.mandateLine ?? " "}
        meta={
          d ? (
            <>
              <ReputationBadge score={d.reputation} label />
              <BrainChip tier={d.brainTier} />
              {d.status !== "active" && <Badge tone={d.status === "liquidated" ? "solid" : "gold"}>{STATUS_LABEL[d.status]}</Badge>}
            </>
          ) : undefined
        }
        actions={
          d && d.status !== "liquidated" ? (
            <>
              <AccountCta verb="buy in" need="account" onClick={() => setSheet("buy")}>
                Buy in
              </AccountCta>
              <Button variant="secondary" onClick={() => setSheet("trade")}>
                Trade coin
              </Button>
            </>
          ) : undefined
        }
      />
      {notFound ? (
        <EmptyState icon="search" title="We couldn't find that fund" body="It may have been retired, or the link is off. The arena lists every live fund." action={{ label: "See all funds", href: "/app" }} />
      ) : q.isError && !d ? (
        <div className="pt-10">
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} />
        </div>
      ) : (
        <Reveal ready={!!d} fallback={<FundSkeleton />}>
          {() => <FundBody fund={d!} />}
        </Reveal>
      )}
      {d && (
        <>
          <OrderSheet
            key={sheet === "sell" ? "sell" : "buy"}
            open={sheet === "buy" || sheet === "sell"}
            onOpenChange={(o) => setSheet(o ? (sheet === "sell" ? "sell" : "buy") : null)}
            fund={d}
            initialSide={sheet === "sell" ? "sell" : "buy"}
          />
          <TradeSheet open={sheet === "trade"} onOpenChange={(o) => setSheet(o ? "trade" : null)} fund={d} />
        </>
      )}
    </>
  );
}

function FundBody({ fund }: { fund: FundDetail }) {
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <KpiGrid label={`${fund.name} at a glance`}>
        <StatTile label="NAV per coin" value={price(fund.nav)} sub={fund.ret1d === null ? "Waiting for 2 posts" : `${pct(fund.ret1d)} today`} tone={null} />
        <StatTile label="Coin price" value={price(fund.coinPrice)} sub={fund.premium === null ? "No pool price yet" : `${pct(fund.premium)} vs NAV`} />
        <StatTile label="Season return" value={pct(fund.retSeason)} sub={fund.vsSpy === null ? "SPY not priced yet" : `${pp(fund.vsSpy)} vs SPY`} tone={fund.retSeason === null ? null : fund.retSeason >= 0 ? "up" : "down"} />
        <StatTile label="Fund value" value={usd(fund.valueUsd || fund.aum, { compact: true })} sub={`${fund.outsideHolders.toFixed(1)}% from outside investors`} />
      </KpiGrid>
      <nav aria-label="On this page" className="-mt-1">
        <HScroll className="-mx-4 px-1 md:-mx-3 md:px-0" innerClassName="gap-1">
          {ANCHORS.map((a) => (
            <a
              key={a.id}
              href={`#${a.id}`}
              className="inline-flex h-11 items-center rounded-full px-3 text-label font-medium text-ink-2 transition-colors duration-150 hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.98]"
            >
              {a.label}
            </a>
          ))}
          <span className="ml-auto hidden items-center gap-2 pr-1 text-caption text-ink-3 md:inline-flex">
            Coin <PremiumTag premium={fund.premium} />
          </span>
        </HScroll>
      </nav>
      <div id="chart" className="grid scroll-mt-24 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <SharedElement kind="fund-chart" id={fund.id}>
          <div className="min-w-0 lg:col-span-7">
            <NavVsSpyChart fund={fund} className="h-full" />
          </div>
        </SharedElement>
        <div className="min-w-0 lg:col-span-5">
          <CoinCandlesChart fund={fund} className="h-full" />
        </div>
      </div>
      <HoldingsCard fund={fund} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <MovesTimeline fund={fund.id} className="lg:col-span-7" />
        <ReputationCard fund={fund} className="lg:col-span-5" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
        <PromiseCard fund={fund} />
        <BrainCard fund={fund} />
        <HoldersCard fund={fund} />
        <SeatCard fund={fund} />
      </div>
      <p className="text-caption text-ink-3">
        A simulation priced off real markets: coins are testnet tokens, nobody owns real shares, and startup prices are{" "}
        <Term id="estimated">estimated</Term>. {fund.dnaCommitted && !fund.dna ? "This manager's hidden DNA is sealed on-chain until the season ends." : ""}
      </p>
    </div>
  );
}

function FundSkeleton() {
  return (
    <LoadingRegion label="Loading the fund" className="flex flex-col gap-4 lg:gap-6">
      <div className="grid grid-cols-2 gap-4 md:gap-5 lg:grid-cols-4 lg:gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-11 w-full max-w-md rounded-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <FundChartsSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <SideCardSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}
