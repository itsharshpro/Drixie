"use client";

import type { FundRow, FundScoreRow, QuarterResult, SeasonClock, SeasonResponse, UserScoreRow } from "@listed/shared";
import { Lock, Trophy } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";
import { nftImageUrl } from "@/lib/funds/api";
import { pct, pp, toneOf, usd } from "@/lib/funds/format";
import { fundColorVar, fundName } from "@/lib/funds/meta";
import { useFundPredictions, usePredictFund } from "@/lib/funds/predictions";
import { useFund, useFunds, useSeason } from "@/lib/funds/queries";
import { useNow } from "@/lib/hooks/use-now";
import { AccountCta } from "../ui/account-cta";
import { Badge, RankBadge } from "../ui/badge";
import { Card, CardBody, CardHeader, CARD_TITLE } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { HouseTag } from "../ui/house-tag";
import { PageHeader } from "../ui/page-header";
import { LoadingRegion, Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { AnimatedItem, AnimatedList, NAV, Reveal } from "../ui/transitions";
import { ReputationBadge } from "./bits";
import { FundDot, FundIdentity, FundMark } from "./fund-mark";

export function CompeteScreen() {
  const q = useSeason();
  return (
    <>
      <PageHeader
        title="Compete"
        subtitle={
          <>
            Managers race for the season trophy; investors race on return. Call today&apos;s winner and see who&apos;s ahead. A{" "}
            <Term id="season">season</Term> is four one-day quarters.
          </>
        }
        back={false}
      />
      {q.isError && !q.data ? (
        <div className="pt-10">
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} />
        </div>
      ) : (
        <Reveal ready={!!q.data} fallback={<CompeteSkeleton />}>
          {() => <CompeteBody s={q.data!} />}
        </Reveal>
      )}
    </>
  );
}

function CompeteBody({ s }: { s: SeasonResponse }) {
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <SeasonClockCard clock={s.clock} settled={s.settled} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <FundBoard rows={s.funds} className="lg:col-span-8" />
        <PredictionCard clock={s.clock} className="lg:col-span-4" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <UserBoard rows={s.users} className="lg:col-span-6" />
        <QuarterResults quarters={s.quarters} className="lg:col-span-6" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <TrophiesCard s={s} className="lg:col-span-5" />
        <DnaCard revealed={s.dnaRevealed} className="lg:col-span-7" />
      </div>
    </div>
  );
}

function SeasonClockCard({ clock, settled }: { clock: SeasonClock | null; settled: boolean }) {
  const now = useNow(1000);
  if (!clock) {
    return (
      <Card>
        <EmptyState icon="bell" title="The season hasn't started" body="The clock starts with the first rebalance bell. Every quarter is one day; four make a season." compact />
      </Card>
    );
  }
  const left = (iso: string | null) => (iso && now !== null ? Math.max(0, Date.parse(iso) - now) : null);
  const qLeft = left(clock.quarterEndsAt);
  const sLeft = left(clock.seasonEndsAt);
  const qFrac = qLeft !== null ? Math.max(0, Math.min(1, 1 - qLeft / (clock.quarterSecs * 1000))) : 0;
  return (
    <Card as="section" aria-labelledby="clock-h" padded className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-caption font-medium text-gold-text">{settled ? "Season settled" : "Season clock"}</p>
          <h2 id="clock-h" className="text-title font-semibold tracking-[-0.015em] text-ink">
            Season <span className="num">{clock.season}</span> · Quarter <span className="num">{clock.quarter}</span> of{" "}
            <span className="num">{clock.quarters}</span>
          </h2>
        </div>
        <p className="text-caption text-ink-3">
          Bell <span className="num text-ink-2">{clock.bell}</span> · a bell every <span className="num">{Math.round(clock.bellSecs / 60)}</span> min ·{" "}
          <span className="num">${clock.gameUsdPerNear}</span> per testnet NEAR
        </p>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${clock.quarters}, minmax(0, 1fr))` }} aria-hidden>
        {Array.from({ length: clock.quarters }, (_, i) => {
          const n = i + 1;
          const fill = n < clock.quarter ? 1 : n === clock.quarter ? qFrac : 0;
          return (
            <div key={n} className="flex flex-col gap-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-fill">
                <div className="h-full rounded-full bg-gold transition-[width] duration-1000 ease-linear" style={{ width: `${fill * 100}%` }} />
              </div>
              <span className={cn("num text-caption", n === clock.quarter ? "font-medium text-ink" : "text-ink-3")}>Q{n}</span>
            </div>
          );
        })}
      </div>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded-control border border-line bg-paper p-4">
          <dt className="text-caption text-ink-3">Quarter ends in</dt>
          <dd className="num mt-1 text-title-sm font-semibold text-ink">{qLeft === null ? "—" : formatCountdown(qLeft)}</dd>
        </div>
        <div className="rounded-control border border-line bg-paper p-4">
          <dt className="text-caption text-ink-3">Season ends in</dt>
          <dd className="num mt-1 text-title-sm font-semibold text-ink">{sLeft === null ? "—" : formatCountdown(sLeft)}</dd>
        </div>
        <div className="col-span-2 rounded-control border border-line bg-paper p-4 md:col-span-1">
          <dt className="text-caption text-ink-3">Next bell in</dt>
          <dd className="num mt-1 text-title-sm font-semibold text-ink">{left(clock.nextBellAt) === null ? "—" : formatCountdown(left(clock.nextBellAt)!)}</dd>
        </div>
      </dl>
    </Card>
  );
}

const PARTS: { key: keyof FundScoreRow["parts"]; label: string; weight: number; tone: string }[] = [
  { key: "vsSpy", label: "vs SPY", weight: 50, tone: "var(--viz-cobalt)" },
  { key: "outsideGrowth", label: "Outside money", weight: 20, tone: "var(--viz-teal)" },
  { key: "reputation", label: "Reputation", weight: 20, tone: "var(--viz-plum)" },
  { key: "promise", label: "Promise", weight: 10, tone: "var(--viz-gold)" },
];

function ScoreBar({ row }: { row: FundScoreRow }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-fill" role="img" aria-label={PARTS.map((p) => `${p.label} ${Math.round(row.parts[p.key])}`).join(", ")}>
      {PARTS.map((p) => (
        <span key={p.key} className="h-full" style={{ width: `${(Math.max(0, Math.min(100, row.parts[p.key])) / 100) * p.weight}%`, background: p.tone }} />
      ))}
    </div>
  );
}

function FundBoard({ rows, className }: { rows: FundScoreRow[]; className?: string }) {
  return (
    <Card as="section" aria-labelledby="fboard-h" className={cn("@container overflow-hidden", className)}>
      <CardHeader id="fboard-h" icon={<Trophy className="size-5 text-gold" strokeWidth={1.5} aria-hidden />} title="Fund leaderboard" subtitle="Season score out of 100, updated every bell" />
      {rows.length === 0 ? (
        <EmptyState icon="index" title="No scores yet" body="Scores appear after the first NAV posts of the season." compact />
      ) : (
        <>
          <AnimatedList as="ol" className="mt-4 flex flex-col divide-y divide-line border-t border-line">
            {rows.map((r, i) => (
              <AnimatedItem as="li" key={r.fund} index={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-5 py-3 @2xl:grid-cols-[auto_1.3fr_1fr_repeat(3,auto)] md:px-6">
                <RankBadge rank={r.rank} />
                <FundIdentity fund={r.fund} name={r.name} size="md" href={`/app/f/${r.fund}`} sub={r.promiseKept === null ? undefined : r.promiseKept ? "Promise kept" : "Promise missed"} />
                <div className="col-span-3 flex flex-col gap-1 @2xl:col-span-1">
                  <ScoreBar row={r} />
                </div>
                <span className={cn("num hidden w-20 text-right text-body-sm @2xl:block", toneOf(r.vsSpy))}>{pp(r.vsSpy)}</span>
                <span className="hidden @2xl:block">
                  <ReputationBadge score={r.reputation} />
                </span>
                <span className="num row-start-1 w-12 text-right text-body font-semibold text-ink @2xl:row-auto">{Math.round(r.score)}</span>
              </AnimatedItem>
            ))}
          </AnimatedList>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-caption text-ink-3 md:px-6">
            {PARTS.map((p) => (
              <span key={p.key} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: p.tone }} /> {p.label} {p.weight}%
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function PredictionCard({ clock, className }: { clock: SeasonClock | null; className?: string }) {
  const funds = useFunds();
  const session = useSession();
  const q = useFundPredictions(clock?.season ?? null, clock?.quarter ?? null);
  const predict = usePredictFund();
  const rows: FundRow[] = funds.data?.items ?? [];
  const state = q.data;
  const crowd = state?.available ? state.crowd : {};
  const total = Object.values(crowd).reduce((s, n) => s + n, 0);
  const mine = state?.available ? state.mine : null;
  const open = state?.available ? state.open : false;
  return (
    <Card as="section" id="predictions" aria-labelledby="pred-h" className={cn("flex scroll-mt-24 flex-col", className)}>
      <CardHeader id="pred-h" title={<Term id="prediction">Which fund wins today?</Term>} subtitle={clock ? `Quarter ${clock.quarter} · scored when it closes` : "Opens with the season"} />
      <CardBody className="flex flex-1 flex-col gap-3">
        {!state ? (
          <div className="flex flex-col gap-2" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-control" />
            ))}
          </div>
        ) : !state.available || !clock || rows.length === 0 ? (
          <>
            <p className="rounded-control bg-fill p-4 text-body-sm text-ink-2">
              Calls open soon. Pick the fund you think posts the best return today; it&apos;s free and scored at the close.
            </p>
            <ul className="flex flex-col gap-2" aria-label="Funds in today's race">
              {rows.map((f) => (
                <li key={f.id} className="flex min-h-12 items-center gap-3 rounded-control border border-line px-3">
                  <FundMark fund={f.id} size={24} />
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-ink">{f.name}</span>
                  <span className={cn("num text-caption", toneOf(f.ret1d))}>{pct(f.ret1d)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {rows.map((f) => {
                const n = crowd[f.id] ?? 0;
                const share = total ? n / total : 0;
                const picked = mine?.fund === f.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={!open || !!mine || session.status !== "ready" || predict.isPending}
                      onClick={() => predict.mutate({ season: clock.season, quarter: clock.quarter, fund: f.id, fundName: f.name })}
                      className={cn(
                        "relative flex min-h-12 w-full items-center gap-3 overflow-hidden rounded-control border px-3 text-left transition-colors duration-150",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default",
                        picked ? "border-brand" : "border-line enabled:hover:bg-fill",
                      )}
                    >
                      <span aria-hidden className="absolute inset-y-0 left-0 opacity-10 transition-[width] duration-500" style={{ width: `${share * 100}%`, background: fundColorVar(f.id) }} />
                      <FundMark fund={f.id} size={24} />
                      <span className="relative min-w-0 flex-1 truncate text-body-sm font-medium text-ink">{f.name}</span>
                      {picked && <Badge tone="brand">Your call</Badge>}
                      <span className="num relative text-caption text-ink-2">{total ? `${Math.round(share * 100)}%` : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto">
              {session.status !== "ready" ? (
                <AccountCta verb="make a call" need="account" block variant="secondary">
                  Make a call
                </AccountCta>
              ) : (
                <p className="text-caption text-ink-3">
                  {mine ? "One call per quarter. Good luck." : open ? "Tap a fund to call it. One call per quarter." : "Calls for this quarter are closed."}{" "}
                  <span className="num">{total}</span> {total === 1 ? "call" : "calls"} so far.
                </p>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function UserBoard({ rows, className }: { rows: UserScoreRow[]; className?: string }) {
  const session = useSession();
  return (
    <Card as="section" id="investors" aria-labelledby="uboard-h" className={cn("scroll-mt-24", className)}>
      <CardHeader id="uboard-h" title="Investor leaderboard" subtitle="Ranked by % return this season" />
      <CardBody>
        {rows.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body-sm text-ink-2">No investors ranked yet. Buy into a fund to get on the board.</p>
            <AccountCta href="/app" verb="get on the board" need="account" variant="secondary">
              Pick a fund
            </AccountCta>
          </div>
        ) : (
          <AnimatedList as="ol" className="flex flex-col divide-y divide-line">
            {rows.slice(0, 20).map((r, i) => (
              <AnimatedItem as="li" key={r.account} index={i} className={cn("flex min-h-12 items-center gap-3 py-2", r.account === session.accountId && "bg-brand-soft/40")}>
                <RankBadge rank={r.rank} size={24} />
                <Link href={`/app/people/${encodeURIComponent(r.account)}`} transitionTypes={[...NAV.forward]} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 hover:underline">
                  <span className="truncate text-body-sm font-medium text-ink">{r.handle ?? r.account.split(".")[0]}</span>
                  <HouseTag account={r.account} isHouse={r.isHouse} />
                </Link>
                <span className="num hidden text-caption text-ink-3 sm:block">{usd(r.valueUsd, { compact: true })}</span>
                <span className={cn("num w-16 text-right text-body-sm font-medium", toneOf(r.retPct))}>{pct(r.retPct)}</span>
              </AnimatedItem>
            ))}
          </AnimatedList>
        )}
      </CardBody>
    </Card>
  );
}

function QuarterResults({ quarters, className }: { quarters: QuarterResult[]; className?: string }) {
  return (
    <Card as="section" aria-labelledby="qres-h" className={className}>
      <CardHeader id="qres-h" title="Quarter results" subtitle="Return per fund in each closed quarter" />
      <CardBody>
        {quarters.length === 0 ? (
          <p className="text-body-sm text-ink-2">The first quarter closes at the end of today. Beating SPY in a quarter earns a fund 3 reputation.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {[...quarters].reverse().map((qr) => (
              <li key={`${qr.season}-${qr.quarter}`} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body-sm font-medium text-ink">
                    Season <span className="num">{qr.season}</span> · Q<span className="num">{qr.quarter}</span>
                  </span>
                  <span className="text-caption text-ink-3">
                    SPY <span className={cn("num", toneOf(qr.spy))}>{pct(qr.spy)}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[...qr.returns]
                    .sort((a, b) => (b.ret ?? -Infinity) - (a.ret ?? -Infinity))
                    .map((r) => (
                      <span key={r.fund} className={cn("inline-flex h-7 items-center gap-1.5 rounded-chip border px-2 text-caption", r.fund === qr.winner ? "border-gold bg-gold-soft" : "border-line")}>
                        <FundDot fund={r.fund} />
                        <span className="text-ink">{fundName(r.fund)}</span>
                        <span className={cn("num", toneOf(r.ret))}>{pct(r.ret)}</span>
                      </span>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function TrophiesCard({ s, className }: { s: SeasonResponse; className?: string }) {
  return (
    <Card as="section" aria-labelledby="troph-h" className={className}>
      <CardHeader id="troph-h" title={<Term id="trophy">Trophies</Term>} subtitle="Manager of the Year, one per season" />
      <CardBody>
        {s.trophies.length === 0 ? (
          <p className="text-body-sm text-ink-2">The first trophy is minted to the winning fund&apos;s seat owner when this season settles.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4">
            {s.trophies.map((t) => (
              <li key={t.tokenId} className="flex flex-col gap-2">
                <div className="aspect-square overflow-hidden rounded-control border border-line bg-paper">
                  <img src={nftImageUrl(t.imageUrl)} alt={t.title} className="size-full object-cover" loading="lazy" />
                </div>
                <p className="text-caption font-medium text-ink">{t.title}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

const TRAITS: { key: "risk" | "patience" | "greed" | "loyalty" | "smarts"; label: string }[] = [
  { key: "risk", label: "Risk" },
  { key: "patience", label: "Patience" },
  { key: "greed", label: "Greed" },
  { key: "loyalty", label: "Loyalty" },
  { key: "smarts", label: "Smarts" },
];

function DnaRow({ id }: { id: string }) {
  const q = useFund(id);
  const dna = q.data?.dna ?? null;
  return (
    <li className="flex flex-col gap-2 py-3">
      <FundIdentity fund={id} name={q.data?.name} size="sm" />
      {dna ? (
        <div className="grid grid-cols-5 gap-2">
          {TRAITS.map((t) => (
            <div key={t.key} className="flex flex-col gap-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                <div className="h-full rounded-full" style={{ width: `${dna[t.key] * 10}%`, background: fundColorVar(id) }} />
              </div>
              <span className="text-[11px] leading-4 text-ink-3">
                {t.label} <span className="num text-ink-2">{dna[t.key]}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-caption text-ink-3">{q.data ? "Not revealed yet." : "Loading…"}</p>
      )}
    </li>
  );
}

function DnaCard({ revealed, className }: { revealed: boolean; className?: string }) {
  const funds = useFunds();
  const ids = funds.data?.items.map((f) => f.id) ?? [];
  return (
    <Card as="section" aria-labelledby="dna-h" className={className}>
      <CardHeader
        id="dna-h"
        title={<Term id="dna">Hidden DNA</Term>}
        subtitle="Risk, patience, greed, loyalty and smarts, 1 to 10"
        action={revealed ? <Badge tone="up">Revealed</Badge> : <Badge tone="neutral">Sealed</Badge>}
      />
      <CardBody>
        {!revealed ? (
          <div className="flex items-start gap-3 rounded-control bg-fill p-4">
            <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <p className="text-body-sm text-ink-2">
              Every manager&apos;s five traits are sealed on-chain at season start and revealed when the season settles. Until then, read their moves
              and guess.
            </p>
          </div>
        ) : ids.length === 0 ? (
          <p className="text-body-sm text-ink-2">No funds to show.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {ids.map((id) => (
              <DnaRow key={id} id={id} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function CompeteSkeleton() {
  return (
    <LoadingRegion label="Loading the season" className="flex flex-col gap-4 lg:gap-6">
      <Card padded className="flex flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-control" />
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <Card padded className="flex flex-col gap-3 lg:col-span-8">
          <Skeleton className={cn("h-4 w-36", CARD_TITLE)} />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
        <Card padded className="flex flex-col gap-3 lg:col-span-4">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-control" />
          ))}
        </Card>
      </div>
    </LoadingRegion>
  );
}
