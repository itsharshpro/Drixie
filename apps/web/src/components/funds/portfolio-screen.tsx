"use client";

import type { FundPortfolio, FundPosition } from "@listed/shared";
import { Clock } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { coins, pct, price, toneOf, usd } from "@/lib/funds/format";
import { fundName } from "@/lib/funds/meta";
import { useCancelOrder } from "@/lib/funds/mutations";
import { useFundPortfolio } from "@/lib/funds/queries";
import { nftImageUrl } from "@/lib/funds/api";
import { useNow } from "@/lib/hooks/use-now";
import { AccountPrompt } from "../ui/account-cta";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { PageHeader } from "../ui/page-header";
import { LoadingRegion, Skeleton } from "../ui/skeleton";
import { KpiGrid, StatTile, StatTileSkeleton } from "../ui/stat-tile";
import { Term } from "../ui/term";
import { TimeAgo } from "../ui/time-ago";
import { AnimatedItem, AnimatedList, NAV, Reveal } from "../ui/transitions";
import { VerifyLink } from "../ui/verify-link";
import { AccountCard } from "../portfolio/account-card";
import { FundIdentity } from "./fund-mark";
import { orderLabel, useGameRate } from "./order-sheet";

export function FundPortfolioScreen() {
  const session = useSession();
  const account = session.status === "ready" ? session.accountId : null;
  const q = useFundPortfolio(account);
  return (
    <>
      <PageHeader title="Portfolio" subtitle="Your fund coins, what they're worth, your profit, orders waiting for the bell and your badges." back={false} />
      <AccountCard />
      <AccountPrompt verb="see your portfolio" need="account">
        {q.isError && !q.data ? (
          <div className="pt-10">
            <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} />
          </div>
        ) : (
          <Reveal ready={!!q.data} fallback={<PortfolioSkeleton />}>
            {() => <PortfolioBody p={q.data!} />}
          </Reveal>
        )}
      </AccountPrompt>
    </>
  );
}

export function PortfolioBody({ p, owner = true }: { p: FundPortfolio; owner?: boolean }) {
  const positions = p.positions.filter((x) => x.coinsNum > 0);
  const empty = positions.length === 0 && p.pendingOrders.length === 0;
  if (!owner) {
    return (
      <div className="flex flex-col gap-4 lg:gap-6">
        <KpiGrid label="Totals">
          <StatTile label="Value now" value={usd(p.totalValueUsd)} sub={`${positions.length} ${positions.length === 1 ? "fund" : "funds"}`} />
          <StatTile label="Profit" value={usd(p.pnlUsd, { signed: true })} sub={p.pnlPct === null ? "—" : pct(p.pnlPct)} tone={p.pnlUsd > 0 ? "up" : p.pnlUsd < 0 ? "down" : null} />
          <StatTile label="Paid in" value={usd(p.totalCostUsd)} sub="Buy-ins and coin buys, minus cash-outs" />
          <StatTile label="Badges" value={String(p.badges.length)} sub={p.badges.length ? "Soulbound NFTs" : "None yet"} />
        </KpiGrid>
        {positions.length === 0 ? (
          <Card>
            <EmptyState icon="portfolio" title="No fund coins right now" body="This player holds no fund coins at the moment." action={{ label: "Compare the funds", href: "/app" }} />
          </Card>
        ) : (
          <PositionsCard positions={positions} owner={false} />
        )}
        <BadgesCard p={p} owner={false} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <KpiGrid label="Your totals">
        <StatTile label="Value now" value={usd(p.totalValueUsd)} sub={`${positions.length} ${positions.length === 1 ? "fund" : "funds"}`} />
        <StatTile label="Profit" value={usd(p.pnlUsd, { signed: true })} sub={p.pnlPct === null ? "—" : pct(p.pnlPct)} tone={p.pnlUsd > 0 ? "up" : p.pnlUsd < 0 ? "down" : null} />
        <StatTile label="Paid in" value={usd(p.totalCostUsd)} sub="Buy-ins and coin buys, minus cash-outs" />
        <StatTile label="Waiting for the bell" value={String(p.pendingOrders.length)} sub={p.pendingOrders.length ? "Fills at the next NAV" : "No orders waiting"} />
      </KpiGrid>
      {empty ? (
        <Card>
          <EmptyState
            icon="portfolio"
            title="No fund coins yet"
            body={
              <>
                Take the risk check to find a manager that fits you, then buy in. New here? <Link href="/app/guide#actions">See what you can do</Link>.
              </>
            }
            action={{ label: "Take the risk check", href: "/app/start" }}
          />
        </Card>
      ) : (
        <>
          <PositionsCard positions={positions} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
            <OrdersCard p={p} className="lg:col-span-7" />
            <PromisesCard p={p} className="lg:col-span-5" />
          </div>
        </>
      )}
      <BadgesCard p={p} />
    </div>
  );
}

function PositionsCard({ positions, owner = true }: { positions: FundPosition[]; owner?: boolean }) {
  return (
    <Card as="section" aria-labelledby="pos-h" className="@container overflow-hidden">
      <CardHeader id="pos-h" title={owner ? "Your funds" : "Funds held"} subtitle="Valued at each fund's latest NAV" />
      <ul className="mt-4 flex flex-col divide-y divide-line border-t border-line">
        {positions.map((x) => (
          <li
            key={x.fund}
            className={cn(
              "grid grid-cols-1 gap-3 px-5 py-4 @2xl:items-center md:px-6",
              owner ? "@2xl:grid-cols-[1.4fr_repeat(3,1fr)_auto]" : "@2xl:grid-cols-[1.4fr_repeat(3,1fr)]",
            )}
          >
            <FundIdentity fund={x.fund} name={x.fundName} sub={<>{coins(x.coinsNum)} coins · NAV <span className="num">{price(x.nav)}</span></>} href={`/app/f/${x.fund}`} />
            <div className="flex justify-between gap-2 @2xl:block @2xl:text-right">
              <span className="text-caption text-ink-3 @2xl:block">Value</span>
              <span className="num text-body-sm font-medium text-ink">{usd(x.valueUsd)}</span>
            </div>
            <div className="flex justify-between gap-2 @2xl:block @2xl:text-right">
              <span className="text-caption text-ink-3 @2xl:block">Profit</span>
              <span className={cn("num text-body-sm font-medium", toneOf(x.pnlUsd))}>
                {usd(x.pnlUsd, { signed: true })} <span className="text-caption">{x.pnlPct === null ? "" : pct(x.pnlPct)}</span>
              </span>
            </div>
            <div className="flex justify-between gap-2 @2xl:block @2xl:text-right">
              <span className="text-caption text-ink-3 @2xl:block">
                <Term id="cash-out">Exit load</Term>
              </span>
              <span className="num text-body-sm text-ink">{x.exitLoadPct.toFixed(1)}%</span>
            </div>
            {owner && <div className="flex gap-2 @2xl:justify-end">
              <Button asChild size="sm" variant="secondary">
                <Link href={`/app/f/${x.fund}?sheet=buy`} transitionTypes={[...NAV.forward]}>
                  Buy more
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/app/f/${x.fund}?sheet=sell`} transitionTypes={[...NAV.forward]}>
                  Cash out
                </Link>
              </Button>
            </div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OrdersCard({ p, className }: { p: FundPortfolio; className?: string }) {
  const cancel = useCancelOrder();
  const rate = useGameRate();
  const now = useNow(30_000);
  const recent = p.recentOrders.filter((o) => o.status !== "queued").slice(0, 8);
  return (
    <Card as="section" id="orders" aria-labelledby="orders-h" className={cn("scroll-mt-24", className)}>
      <CardHeader id="orders-h" icon={<Clock className="size-5 text-ink-2" strokeWidth={1.5} aria-hidden />} title="Orders" subtitle="Buy-ins and cash-outs fill at the NAV posted right after the bell" />
      <CardBody>
        {p.pendingOrders.length === 0 && recent.length === 0 ? (
          <p className="text-body-sm text-ink-2">No orders yet.</p>
        ) : (
          <AnimatedList as="ul" className="flex flex-col divide-y divide-line">
            {p.pendingOrders.map((o, i) => (
              <AnimatedItem as="li" key={o.id} index={i} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm text-ink">
                    {orderLabel(o, rate)} · {fundName(o.fund)}
                  </p>
                  <p className="text-caption text-ink-3">
                    Waiting · placed <TimeAgo at={o.queuedAt} now={now} fixed={false} />
                  </p>
                </div>
                <Badge tone="brand">Waiting</Badge>
                <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables?.id === o.id} loadingLabel="Cancelling" onClick={() => cancel.mutate({ id: o.id, fund: o.fund })}>
                  Cancel
                </Button>
              </AnimatedItem>
            ))}
            {recent.map((o, i) => (
              <AnimatedItem as="li" key={o.id} index={p.pendingOrders.length + i} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm text-ink">
                    {orderLabel(o, rate)} · {fundName(o.fund)}
                  </p>
                  <p className="text-caption text-ink-3">
                    {o.status === "filled" ? (
                      <>
                        Filled at <span className="num">{price(o.fillNav)}</span>
                        {o.fillBell !== null && <> · bell <span className="num">{o.fillBell}</span></>}
                      </>
                    ) : (
                      "Cancelled"
                    )}
                    {" · "}
                    <TimeAgo at={o.filledAt ?? o.queuedAt} now={now} fixed={false} />
                  </p>
                </div>
                <Badge tone={o.status === "filled" ? "up" : "neutral"}>{o.status === "filled" ? "Filled" : "Cancelled"}</Badge>
                <VerifyLink txHash={o.txHash} />
              </AnimatedItem>
            ))}
          </AnimatedList>
        )}
      </CardBody>
    </Card>
  );
}

function PromisesCard({ p, className }: { p: FundPortfolio; className?: string }) {
  return (
    <Card as="section" aria-labelledby="prom-h" className={className}>
      <CardHeader id="prom-h" title={<Term id="promise-bond">Promises on your funds</Term>} subtitle="What each manager promised this season" />
      <CardBody>
        {p.promises.length === 0 ? (
          <p className="text-body-sm text-ink-2">None of your funds has set a promise yet. Managers set one at season start, backed by their own coins.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {p.promises.map(({ fund, promise }) => {
              const target = promise.targetBps / 100;
              const fill = promise.progressPct !== null && target > 0 ? Math.max(0, Math.min(1, promise.progressPct / target)) : 0;
              return (
                <li key={fund} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <FundIdentity fund={fund} size="sm" />
                    <Badge tone={promise.status === "kept" ? "up" : promise.status === "missed" ? "down" : "brand"}>
                      {promise.status === "open" ? "Open" : promise.status === "kept" ? "Kept" : "Missed"}
                    </Badge>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden>
                    <div className="h-full rounded-full bg-gold" style={{ width: `${fill * 100}%` }} />
                  </div>
                  <p className="text-caption text-ink-2">
                    <span className="num text-ink">{pct(promise.progressPct)}</span> of a <span className="num text-ink">{pct(target)}</span> target · bond{" "}
                    <span className="num text-ink">{usd(promise.bondUsd, { compact: true })}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function BadgesCard({ p, owner = true }: { p: FundPortfolio; owner?: boolean }) {
  return (
    <Card as="section" aria-labelledby="badges-h">
      <CardHeader id="badges-h" title={<Term id="badge">{owner ? "Your badges" : "Badges"}</Term>} subtitle="Soulbound NFTs: early backer, kept faith, held through a black-swan day, backed the winner" />
      <CardBody>
        {p.badges.length === 0 ? (
          <p className="text-body-sm text-ink-2">{owner ? "No badges yet. The first 100 investors in each fund get Early backer." : "No badges yet."}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {p.badges.map((b) => (
              <li key={b.tokenId} className="flex flex-col gap-2">
                <div className="aspect-square overflow-hidden rounded-control border border-line bg-paper">
                  <img src={nftImageUrl(b.imageUrl)} alt={b.title} className="size-full object-cover" loading="lazy" />
                </div>
                <p className="text-caption font-medium text-ink">{b.title}</p>
                {b.fund && <p className="text-caption text-ink-3">{fundName(b.fund)}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function PortfolioSkeleton() {
  return (
    <LoadingRegion label="Loading your portfolio" className="flex flex-col gap-4 lg:gap-6">
      <div className="grid grid-cols-2 gap-4 md:gap-5 lg:grid-cols-4 lg:gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <Card padded className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </Card>
    </LoadingRegion>
  );
}
