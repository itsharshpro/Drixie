"use client";

import type { FundDetail, ReputationEvent } from "@listed/shared";
import { yoctoToNear } from "@listed/shared";
import { Brain, Gavel, Handshake, Link2, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatAgo } from "@/lib/format";
import { bps, coins, nearToUsd, pct, until, usd } from "@/lib/funds/format";
import { BRAIN_RULE, fundName, REPUTATION_EVENT_LABEL, reputationTone } from "@/lib/funds/meta";
import { useReputation } from "@/lib/funds/queries";
import { useNow } from "@/lib/hooks/use-now";
import { LineChart } from "../charts/line-chart";
import { AccountCta } from "../ui/account-cta";
import { Badge } from "../ui/badge";
import { Card, CardBody, CardHeader } from "../ui/card";
import { ErrorState } from "../ui/error-state";
import { Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { TimeAgo } from "../ui/time-ago";
import { AnimatedItem, AnimatedList, NAV } from "../ui/transitions";
import { BrainChip, ReputationBadge } from "./bits";
import { FundMark } from "./fund-mark";
import { useGameRate } from "./order-sheet";
import { SeatBidSheet } from "./seat-sheet";

function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-2", className)}>
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="num text-body-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function EventRow({ e, now }: { e: ReputationEvent; now: number | null }) {
  const up = e.delta > 0;
  return (
    <div className="flex items-start gap-3 py-3">
      <span
        className={cn(
          "num mt-0.5 inline-flex h-6 min-w-12 shrink-0 items-center justify-center rounded-chip px-2 text-caption font-semibold",
          e.kind === "anchor" ? "bg-fill text-ink-2" : up ? "bg-up-soft text-up" : "bg-down-soft text-down",
        )}
      >
        {e.kind === "anchor" ? <Link2 className="size-3.5" aria-label="Anchored" /> : `${up ? "+" : "−"}${Math.abs(e.delta).toFixed(Math.abs(e.delta) % 1 ? 1 : 0)}`}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-ink">{REPUTATION_EVENT_LABEL[e.kind] ?? e.kind}</p>
        <p className="text-caption text-ink-2">{e.reason}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <TimeAgo at={e.at} now={now} className="text-caption text-ink-3" />
        <span className="num text-caption text-ink-3">→ {Math.round(e.score)}</span>
      </div>
    </div>
  );
}

export function ReputationCard({ fund, className }: { fund: FundDetail; className?: string }) {
  const q = useReputation(fund.id);
  const now = useNow(60_000);
  const tone = reputationTone(fund.reputation);
  const pts = q.data?.points ?? [];
  return (
    <Card as="section" id="reputation" aria-labelledby="rep-h" className={cn("scroll-mt-24", className)}>
      <CardHeader
        id="rep-h"
        icon={<ShieldCheck className="size-5 text-ink-2" strokeWidth={1.5} aria-hidden />}
        title={<Term id="reputation">Reputation</Term>}
        subtitle="Every change is public, with its reason"
        action={<ReputationBadge score={fund.reputation} />}
      />
      <CardBody>
        {q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
        ) : !q.data ? (
          <div className="flex flex-col gap-3" aria-hidden>
            <Skeleton className="h-[140px] w-full rounded-control" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {pts.length >= 2 ? (
              <LineChart
                label={`${fund.name} reputation over time`}
                height={140}
                labels={pts.map((p) => formatAgo(p.t, now ?? Date.parse(p.t)))}
                domain={[0, 100]}
                format={(v) => v.toFixed(1)}
                series={[{ name: "Reputation", tone: tone === "red" ? "down" : tone === "amber" ? "gold" : "up", values: pts.map((p) => p.score), area: true }]}
              />
            ) : (
              <p className="rounded-control bg-fill p-3 text-body-sm text-ink-2">
                Started the season at 60. The line draws as events arrive.
              </p>
            )}
            {q.data.anchoredAt && (
              <p className="mt-3 text-caption text-ink-3">
                Anchored on-chain <TimeAgo at={q.data.anchoredAt} now={now} fixed={false} /> at <span className="num">{q.data.anchoredScore ?? "—"}</span>.
              </p>
            )}
            {q.data.events.length === 0 ? (
              <p className="mt-3 text-body-sm text-ink-2">No reputation events yet. Churn, flip-flops and broken promises cost points; beating the market earns them.</p>
            ) : (
              <AnimatedList as="ul" className="mt-2 flex flex-col divide-y divide-line">
                {q.data.events.slice(0, 12).map((e, i) => (
                  <AnimatedItem as="li" key={e.id} index={i}>
                    <EventRow e={e} now={now} />
                  </AnimatedItem>
                ))}
              </AnimatedList>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function PromiseCard({ fund, className }: { fund: FundDetail; className?: string }) {
  const p = fund.promise;
  const target = p ? p.targetBps / 100 : null;
  const progress = p?.progressPct ?? null;
  const fill = target && progress !== null ? Math.max(0, Math.min(1, progress / target)) : 0;
  return (
    <Card as="section" id="promise" aria-labelledby="promise-h" className={cn("scroll-mt-24", className)}>
      <CardHeader
        id="promise-h"
        icon={<Handshake className="size-5 text-ink-2" strokeWidth={1.5} aria-hidden />}
        title={<Term id="promise-bond">Promise and bond</Term>}
        subtitle={p ? `Season ${p.season}` : "Set at season start"}
        action={p ? <Badge tone={p.status === "kept" ? "up" : p.status === "missed" ? "down" : "brand"}>{p.status === "open" ? "Open" : p.status === "kept" ? "Kept" : "Missed"}</Badge> : null}
      />
      <CardBody>
        {!p ? (
          <p className="text-body-sm text-ink-2">No promise this season yet. Managers set a return target and a bond from their own stake when the season starts.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="num text-title font-semibold tracking-[-0.02em] text-ink">{pct(progress)}</span>
              <span className="text-body-sm text-ink-2">
                of a <span className="num font-medium text-ink">{pct(target)}</span> target
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill" role="progressbar" aria-label="Progress to the promised return" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill * 100)}>
              <div className={cn("h-full rounded-full transition-[width] duration-500", (progress ?? 0) < 0 ? "bg-down" : "bg-gold")} style={{ width: `${fill * 100}%` }} />
            </div>
            <dl className="mt-3 divide-y divide-line">
              <Row label="Bond (manager coins)">{bps(p.bondBps)} of stake</Row>
              <Row label="Bond value">{usd(p.bondUsd, { compact: true })}</Row>
              {p.compensation && <Row label="Paid to investors">{coins(Number(p.compensation) / 1e18)} coins</Row>}
            </dl>
            <p className="mt-2 text-caption text-ink-3">If investors end below the target, they get extra coins up to the bond and the same value of manager coins is burned.</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function BrainCard({ fund, className }: { fund: FundDetail; className?: string }) {
  return (
    <Card as="section" aria-labelledby="brain-h" className={className}>
      <CardHeader
        id="brain-h"
        icon={<Brain className="size-5 text-ink-2" strokeWidth={1.5} aria-hidden />}
        title={<Term id="brain-bill">Brain and bill</Term>}
        subtitle={BRAIN_RULE[fund.brainTier]}
        action={<BrainChip tier={fund.brainTier} />}
      />
      <CardBody>
        <dl className="divide-y divide-line">
          <Row label="Brain bill this quarter">{usd(fund.brainBillQuarter)}</Row>
          <Row label="Brain bill this season">{usd(fund.brainBillSeason)}</Row>
          <Row label="Turnover this quarter">
            <span className={cn(fund.turnoverQuarterPct > fund.caps.turnoverAllowancePct ? "text-down" : "text-ink")}>
              {fund.turnoverQuarterPct.toFixed(1)}% <span className="text-ink-3">of {fund.caps.turnoverAllowancePct}%</span>
            </span>
          </Row>
          <Row label="Status">{fund.status === "autopilot" ? <Badge tone="gold">On autopilot</Badge> : fund.status === "liquidated" ? <Badge tone="solid">Liquidated</Badge> : "Thinking"}</Row>
        </dl>
        {fund.status === "autopilot" && (
          <p className="mt-2 text-caption text-ink-3">
            <Term id="autopilot">Autopilot</Term>: the cash buffer can&apos;t cover the next AI call, so its weights are frozen until it can.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function HoldersCard({ fund, className }: { fund: FundDetail; className?: string }) {
  const inbound = fund.crossHoldings.filter((c) => c.target === fund.id);
  const outbound = fund.crossHoldings.filter((c) => c.holder === fund.id);
  return (
    <Card as="section" aria-labelledby="holders-h" className={className}>
      <CardHeader id="holders-h" icon={<Users className="size-5 text-ink-2" strokeWidth={1.5} aria-hidden />} title="Outside holders" subtitle="Money that isn't the manager's own" />
      <CardBody>
        <div className="flex items-baseline gap-2">
          <span className="num text-title font-semibold tracking-[-0.02em] text-ink">{fund.outsideHolders.toFixed(1)}%</span>
          <span className="text-body-sm text-ink-2">
            of coins · <span className="num">{fund.holderCount}</span> {fund.holderCount === 1 ? "account" : "accounts"}
          </span>
        </div>
        <dl className="mt-3 divide-y divide-line">
          <Row label="Coin supply">{coins(fund.supplyNum)}</Row>
          <Row label="Fund value">{usd(fund.valueUsd, { compact: true })}</Row>
        </dl>
        {(inbound.length > 0 || outbound.length > 0) && (
          <div className="mt-3 flex flex-col gap-2">
            <h3 className="text-caption font-medium text-ink-3">
              <Term id="raid">Cross holdings</Term>
            </h3>
            <ul className="flex flex-col gap-1">
              {[...inbound, ...outbound].map((c) => {
                const other = c.holder === fund.id ? c.target : c.holder;
                const verb = c.holder === fund.id ? "holds" : "is held by";
                return (
                  <li key={`${c.holder}-${c.target}`} className="flex min-h-11 items-center gap-2 text-body-sm">
                    <FundMark fund={other} size={24} />
                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      {verb} <Link href={`/app/f/${other}`} transitionTypes={[...NAV.forward]} className="font-medium text-ink hover:underline">{fundName(other)}</Link>
                    </span>
                    <span className="num text-caption text-ink">{c.pctOfTarget.toFixed(1)}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function SeatCard({ fund, className }: { fund: FundDetail; className?: string }) {
  const session = useSession();
  const rate = useGameRate();
  const [open, setOpen] = useState(false);
  const now = useNow(30_000);
  const seat = fund.seat;
  const auction = seat?.auction ?? null;
  const mine = !!seat?.owner && seat.owner === session.accountId;
  return (
    <Card as="section" id="seat" aria-labelledby="seat-h" className={cn("scroll-mt-24", className)}>
      <CardHeader
        id="seat-h"
        icon={<Gavel className="size-5 text-ink-2" strokeWidth={1.5} aria-hidden />}
        title={<Term id="seat">Manager seat</Term>}
        subtitle="NFT · earns 30% of fees on investors' money"
        action={auction?.open ? <Badge tone="gold">Auction open</Badge> : mine ? <Badge tone="up">Yours</Badge> : null}
      />
      <CardBody>
        <dl className="divide-y divide-line">
          <Row label="Owner">{seat?.owner ? <span className="truncate font-sans">{shortAcct(seat.owner)}</span> : "Not sold yet"}</Row>
          <Row label="Fees earned">{seat ? `${usd(nearToUsd(seat.feesEarned, rate))}` : "—"}</Row>
          {auction?.open && (
            <>
              <Row label="Top bid">{auction.highBid ? `${yoctoToNear(auction.highBid).toFixed(2)} NEAR` : "No bids yet"}</Row>
              {auction.endsAt && (
                <Row label="Ends">
                  <span className="num">{until(auction.endsAt, now)}</span>
                </Row>
              )}
            </>
          )}
        </dl>
        {auction?.open ? (
          <AccountCta verb="bid" need="key" block className="mt-3" onClick={() => setOpen(true)}>
            {auction.endsAt && now !== null && Date.parse(auction.endsAt) <= now ? "Settle the auction" : "Bid for the seat"}
          </AccountCta>
        ) : (
          <p className="mt-2 text-caption text-ink-3">Seats are auctioned at launch and again if the fund is liquidated.</p>
        )}
      </CardBody>
      {auction?.open && <SeatBidSheet open={open} onOpenChange={setOpen} fund={fund.id} name={fund.name} auction={auction} />}
    </Card>
  );
}

function shortAcct(a: string): string {
  const head = a.split(".")[0] ?? a;
  return head.length > 18 ? `${head.slice(0, 8)}…${head.slice(-6)}` : head;
}

export function SideCardSkeleton() {
  return (
    <Card padded aria-hidden className="flex flex-col gap-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </Card>
  );
}

