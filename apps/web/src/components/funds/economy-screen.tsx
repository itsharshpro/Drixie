"use client";

import type { FeedKind, FundRow } from "@listed/shared";
import { yoctoToNear } from "@listed/shared";
import { Quote, Vault } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/funds/format";
import { STATUS_LABEL } from "@/lib/funds/meta";
import { useFund, useFunds, useVault } from "@/lib/funds/queries";
import { Donut } from "../charts/donut";
import { Badge } from "../ui/badge";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Chip } from "../ui/chip";
import { HScroll } from "../ui/hscroll";
import { PageHeader } from "../ui/page-header";
import { Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { TimeAgo } from "../ui/time-ago";
import { Crossfade, transition } from "../ui/transitions";
import { BrainChip, ReputationBadge } from "./bits";
import { FeedList } from "./feed-list";
import { FundIdentity } from "./fund-mark";

type Filter = "all" | "moves" | "money" | "raids" | "reputation" | "news" | "fees";
const FILTERS: { id: Filter; label: string; kinds: FeedKind[] | null; empty: string }[] = [
  { id: "all", label: "Everything", kinds: null, empty: "Moves, trades and news show here as soon as the arena opens." },
  { id: "moves", label: "Moves", kinds: ["move"], empty: "The first reveal lands right after the next rebalance bell." },
  { id: "money", label: "Money in and out", kinds: ["flow", "trade"], empty: "Buy-ins, cash-outs and coin trades show here." },
  { id: "raids", label: "Raids", kinds: ["raid"], empty: "No fund has bought another fund's coin yet." },
  { id: "reputation", label: "Reputation", kinds: ["reputation"], empty: "No reputation changes yet." },
  { id: "news", label: "News wire", kinds: ["news"], empty: "Headlines naming the stocks the funds can hold show here." },
  { id: "fees", label: "Fees and burns", kinds: ["fee", "promise", "season", "nav"], empty: "NAV posts, fees and buybacks show here." },
];

export function EconomyScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0]!;
  return (
    <>
      <PageHeader
        title="Economy"
        subtitle={
          <>
            The news the managers read, every move and <Term id="raid">raid</Term>, reputation events and the <Term id="vault">vault</Term>.
          </>
        }
        back={false}
      />
      <div className="flex flex-col gap-4 lg:gap-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-4 lg:gap-6">
            <VaultCard />
            <HouseCard className="flex-1" />
          </div>
          <AiPulse className="lg:col-span-8" />
        </div>
        <Card as="section" aria-labelledby="feed-h" className="px-5 pb-4 pt-5 md:px-6 md:pt-6">
          <div className="flex flex-col gap-3">
            <div>
              <h2 id="feed-h" className="text-[15px] font-semibold leading-[22px] tracking-[-0.005em] text-ink">
                The wire
              </h2>
              <p className="text-caption text-ink-3">Everything that happens in the arena, newest first</p>
            </div>
            <HScroll className="-mx-5 px-4 md:-mx-6 md:px-5" innerClassName="gap-2">
              {FILTERS.map((x) => (
                <Chip key={x.id} selected={filter === x.id} onClick={() => transition(() => setFilter(x.id))}>
                  {x.label}
                </Chip>
              ))}
            </HScroll>
          </div>
          <Crossfade value={filter} className="mt-2">
            <FeedList kinds={f.kinds} empty={{ title: `No ${f.label.toLowerCase()} yet`, body: f.empty }} />
          </Crossfade>
        </Card>
      </div>
    </>
  );
}

function VaultCard({ className }: { className?: string }) {
  const q = useVault();
  const v = q.data;
  const cov = v?.coveragePct ?? null;
  return (
    <Card as="section" aria-labelledby="vault-h" className={className}>
      <CardHeader id="vault-h" icon={<Vault className="size-5 text-ink-2" strokeWidth={1.5} aria-hidden />} title={<Term id="vault">Vault coverage</Term>} subtitle="Can it pay every holder at NAV?" />
      <CardBody>
        {!v ? (
          <div className="flex items-center gap-5" aria-hidden>
            <Skeleton className="size-[120px] rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <Donut
              value={cov === null ? 0 : Math.min(1, cov / 100)}
              size={120}
              thickness={12}
              tone={cov === null ? "slate" : cov >= 100 ? "up" : "down"}
              label={cov === null ? "No liabilities yet" : `Coverage ${cov.toFixed(0)}%`}
              center={<span className="num text-title-sm font-semibold text-ink">{cov === null ? "—" : `${Math.round(cov)}%`}</span>}
            />
            <dl className="flex min-w-0 flex-1 flex-col gap-2 text-body-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Assets</dt>
                <dd className="num font-medium text-ink">{usd(v.assetsUsd, { compact: true })}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Owed to holders</dt>
                <dd className="num font-medium text-ink">{usd(v.liabilitiesUsd, { compact: true })}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Reserve</dt>
                <dd className="num font-medium text-ink">{yoctoToNear(v.reserve).toFixed(0)} NEAR</dd>
              </div>
            </dl>
          </div>
        )}
        <p className="mt-3 text-caption text-ink-3">
          {cov !== null && cov < 100 ? "Under 100%: cash-outs pay pro rata until it recovers. " : ""}A testnet simulation.
          {v?.updatedAt && (
            <>
              {" "}Updated <TimeAgo at={v.updatedAt} fixed={false} />.
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}

const HOUSE_RULES = [
  { name: "Chaser", rule: "Buys into yesterday's best fund and cashes out of the worst." },
  { name: "Prudent", rule: "Holds every fund with reputation 40 or more; leaves any that falls below." },
  { name: "Planner", rule: "Keeps a moderate mix and rebalances when a fund drifts 5 points." },
  { name: "Arb", rule: "Buys a coin 2% or more under NAV, sells it 2% or more over." },
];

function HouseCard({ className }: { className?: string }) {
  return (
    <Card as="section" aria-labelledby="house-h" className={className}>
      <CardHeader id="house-h" title={<Term id="house-desk">House investors</Term>} subtitle="Disclosed accounts with public rules, always tagged House" />
      <CardBody>
        <ul className="flex flex-col divide-y divide-line">
          {HOUSE_RULES.map((h) => (
            <li key={h.name} className="flex flex-col gap-0.5 py-2.5">
              <span className="text-body-sm font-medium text-ink">{h.name}</span>
              <span className="text-caption text-ink-2">{h.rule}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function PulseRow({ f }: { f: FundRow }) {
  const d = useFund(f.id);
  const note = d.data?.lastNote ?? null;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <FundIdentity fund={f.id} name={f.name} size="sm" href={`/app/f/${f.id}`} className="mr-auto" />
        <BrainChip tier={f.brainTier} />
        <ReputationBadge score={f.reputation} />
        {f.status !== "active" && <Badge tone={f.status === "liquidated" ? "solid" : "gold"}>{STATUS_LABEL[f.status]}</Badge>}
      </div>
      {note ? (
        <p className="flex gap-2 text-body-sm text-ink">
          <Quote className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0">{note}</span>
        </p>
      ) : (
        <p className="text-caption text-ink-3">{d.data ? "No note yet. The first one comes with its first reveal." : "Loading…"}</p>
      )}
    </li>
  );
}

function AiPulse({ className }: { className?: string }) {
  const funds = useFunds();
  const rows = funds.data?.items ?? [];
  return (
    <Card as="section" aria-labelledby="pulse-h" className={cn("flex flex-col", className)}>
      <CardHeader id="pulse-h" title="AI pulse" subtitle="What each manager said at its last reveal" meta={<Term id="brain-bill">Brain bill</Term>} />
      <CardBody>
        {!funds.data ? (
          <div className="flex flex-col gap-3" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-body-sm text-ink-2">The five managers appear here once the arena opens.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((f) => (
              <PulseRow key={f.id} f={f} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
