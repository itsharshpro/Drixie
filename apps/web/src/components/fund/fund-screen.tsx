"use client";

import type { FundDetail } from "@listed/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { pct, pp, price, usd } from "@/lib/funds/format";
import { fundColorVar, fundPastelVar, STATUS_LABEL } from "@/lib/funds/meta";
import { savePickedFund } from "@/lib/funds/local";
import { useFund, useFunds } from "@/lib/funds/queries";
import { ApiError } from "@/lib/api/client";
import { ChartCardSkeleton } from "../charts/chart-frame";
import { HoldersCard, PromiseCard, ReputationCard, SeatCard, SideCardSkeleton } from "../funds/fund-cards";
import { FundMark } from "../funds/fund-mark";
import { HoldingsCard } from "../funds/holdings";

import { OrderSheet } from "../funds/order-sheet";
import { TradeSheet } from "../funds/trade-sheet";
import { AccountCta } from "../ui/account-cta";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { MandateChips, PremiumChip, RiskBadge } from "../ui/fund-chips";
import { NumberRoll } from "../ui/number-roll";
import { LoadingRegion, Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { Reveal, SharedElement, transition } from "../ui/transitions";
import { FundMainChart } from "./fund-main-chart";
import { FundMoves } from "./fund-moves";

type SheetName = "buy" | "sell" | "trade";
const asSheet = (v: string | null): SheetName | null => (v === "buy" || v === "sell" || v === "trade" ? v : null);

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
      {notFound ? (
        <EmptyState icon="search" title="We couldn't find that fund" body="It may have been retired, or the link is off. The arena lists every live fund." action={{ label: "See all funds", href: "/app" }} />
      ) : q.isError && !d ? (
        <div className="pt-10">
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} />
        </div>
      ) : (
        <Reveal ready={!!d} fallback={<FundSkeleton id={fundId} name={name} />}>
          {() => <FundBody fund={d!} onSheet={setSheet} />}
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

function FundHero({ fund, onSheet }: { fund: FundDetail; onSheet: (s: SheetName) => void }) {
  const live = fund.status !== "liquidated";
  return (
    <section aria-labelledby="fund-hero-name" className="rounded-card p-5 md:p-6" style={{ background: fundPastelVar(fund.id) }}>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-4">
          <SharedElement kind="fund-mark" id={fund.id}>
            <FundMark fund={fund.id} size={72} />
          </SharedElement>
          <div className="min-w-0">
            <SharedElement kind="fund-name" id={fund.id}>
              <h1 id="fund-hero-name" className="text-title font-semibold text-ink">
                {fund.name}
              </h1>
            </SharedElement>
            <p className="mt-1 text-body text-ink-2">{fund.mandateLine}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RiskBadge fund={fund.id} mandate={fund.mandate} />
              <MandateChips caps={fund.caps} />
              {fund.status !== "active" && <Badge tone={fund.status === "liquidated" ? "solid" : "gold"}>{STATUS_LABEL[fund.status]}</Badge>}
            </div>
          </div>
        </div>
        <ReputationGauge score={fund.reputation} color={fundColorVar(fund.id)} />
      </div>
      <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-caption text-ink-3">Coin price</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <NumberRoll value={price(fund.coinPrice)} rollOnMount className="num text-display font-semibold text-ink" />
            <PremiumChip premium={fund.premium} />
          </div>
          <p className="num mt-1 text-caption text-ink-2">
            NAV {price(fund.nav)} · {fund.ret1d === null ? "waiting for 2 posts" : `${pct(fund.ret1d)} today`} · season {pct(fund.retSeason)}
            {fund.vsSpy === null ? "" : ` (${pp(fund.vsSpy)} vs SPY)`} · {usd(fund.valueUsd || fund.aum, { compact: true })} fund value
          </p>
        </div>
        {live && (
          <div className="flex flex-wrap gap-2">
            <AccountCta verb="buy in" need="account" onClick={() => onSheet("buy")}>
              Buy in
            </AccountCta>
            <Button variant="secondary" onClick={() => onSheet("trade")}>
              Trade coin
            </Button>
            <Button variant="secondary" onClick={() => onSheet("sell")}>
              Cash out
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function ReputationGauge({ score, color, size = 96 }: { score: number; color: string; size?: number }) {
  const s = Math.max(0, Math.min(100, score));
  const r = size / 2 - 6;
  const c = size / 2;
  const arc = Math.PI * r;
  return (
    <div className="flex shrink-0 flex-col items-center" role="img" aria-label={`Reputation ${Math.round(s)} out of 100`}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`} aria-hidden>
        <path d={`M6,${c} A${r},${r} 0 0 1 ${size - 6},${c}`} fill="none" className="stroke-line" strokeWidth={8} strokeLinecap="round" />
        <path
          d={`M6,${c} A${r},${r} 0 0 1 ${size - 6},${c}`}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${(arc * s) / 100} ${arc}`}
        />
        <text x={c} y={c - 2} textAnchor="middle" fontSize={20} className="num fill-ink font-semibold">
          {Math.round(s)}
        </text>
      </svg>
      <span className="text-caption text-ink-2">
        <Term id="reputation">Reputation</Term>
      </span>
    </div>
  );
}

function FundBody({ fund, onSheet }: { fund: FundDetail; onSheet: (s: SheetName) => void }) {
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <FundHero fund={fund} onSheet={onSheet} />
      <SharedElement kind="fund-chart" id={fund.id}>
        <div id="chart" className="min-w-0 scroll-mt-24">
          <FundMainChart fund={fund} />
        </div>
      </SharedElement>
      <HoldingsCard fund={fund} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <FundMoves fund={fund.id} className="lg:col-span-7" />
        <ReputationCard fund={fund} className="lg:col-span-5" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        <PromiseCard fund={fund} />
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

function FundSkeleton({ id, name }: { id: string; name: string }) {
  return (
    <LoadingRegion label={`Loading ${name}`} className="flex flex-col gap-4 lg:gap-6">
      <div className="rounded-card p-5 md:p-6" style={{ background: fundPastelVar(id) }}>
        <div className="flex gap-4">
          <FundMark fund={id} size={72} />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="mt-6 h-10 w-48" />
      </div>
      <ChartCardSkeleton height={320} value />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        {Array.from({ length: 3 }, (_, i) => (
          <SideCardSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}
