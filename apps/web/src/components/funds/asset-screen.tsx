"use client";

import type { AssetDetail, FundCandleInterval } from "@listed/shared";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/format";
import { candlesChange, chartInterval, FUND_INTERVAL_LABEL, FUND_INTERVAL_WORDS, FUND_INTERVALS, rangeLabel, toCandles } from "@/lib/funds/candles";
import { bps, price, usd } from "@/lib/funds/format";
import { basketLabel, fundName } from "@/lib/funds/meta";
import { useAsset, useAssetCandles } from "@/lib/funds/queries";
import { useNow } from "@/lib/hooks/use-now";
import { ChartCard, ChartCardSkeleton } from "../charts/chart-frame";
import { CandleChartCanvas } from "../trading/candle-chart-canvas";
import { TimeframeTabs } from "../trading/timeframe-tabs";
import { Badge } from "../ui/badge";
import { Card, CardBody, CardHeader } from "../ui/card";
import { ChangeChip } from "../ui/change-chip";
import { CompanyMark } from "../ui/company-mark";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { PageHeader } from "../ui/page-header";
import { LoadingRegion, Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { TimeAgo } from "../ui/time-ago";
import { Crossfade, NAV, Reveal } from "../ui/transitions";
import { FundMark } from "./fund-mark";

export function AssetScreen({ id }: { id: string }) {
  const q = useAsset(id);
  const d = q.data;
  const notFound = q.error instanceof ApiError && q.error.isNotFound;
  return (
    <>
      <PageHeader
        leading={<CompanyMark ticker={id} size={56} />}
        eyebrow={d ? `${basketLabel(d.basket)} · ${d.kind === "startup" ? "Private startup" : d.region === "india" ? "India" : "US stock"}` : "Asset"}
        title={d?.name ?? id.toUpperCase()}
        subtitle={d ? <span className="num">{d.id}</span> : " "}
        meta={
          d ? (
            <>
              <span className="num text-body font-semibold text-ink">{price(d.price)}</span>
              <ChangeChip value={d.change1d} size="sm" suffix="1d" />
              {d.estimated && (
                <Badge tone="gold">
                  <Term id="estimated">Estimated</Term>
                </Badge>
              )}
              {d.updatedAt && (
                <span className="text-caption text-ink-3">
                  updated <TimeAgo at={d.updatedAt} fixed={false} />
                </span>
              )}
            </>
          ) : undefined
        }
      />
      {notFound ? (
        <EmptyState icon="search" title="We couldn't find that asset" body="The funds can hold 44 assets. Browse them by basket." action={{ label: "Browse the stocks", href: "/app/stocks" }} />
      ) : q.isError && !d ? (
        <div className="pt-10">
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} />
        </div>
      ) : (
        <Reveal ready={!!d} fallback={<AssetSkeleton />}>
          {() => <AssetBody asset={d!} />}
        </Reveal>
      )}
    </>
  );
}

function AssetBody({ asset }: { asset: AssetDetail }) {
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <AssetChart asset={asset} className="lg:col-span-8" />
        <HeldByCard asset={asset} className="lg:col-span-4" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <NewsCard asset={asset} className={asset.kind === "startup" ? "lg:col-span-8" : "lg:col-span-12"} />
        {asset.kind === "startup" && <ValuationCard asset={asset} className="lg:col-span-4" />}
      </div>
    </div>
  );
}

function AssetChart({ asset, className }: { asset: AssetDetail; className?: string }) {
  const [interval, setIv] = useState<FundCandleInterval>(asset.kind === "startup" ? "1d" : "1h");
  const q = useAssetCandles(asset.id, interval);
  const candles = useMemo(() => toCandles(q.data?.candles), [q.data]);
  return (
    <ChartCard
      className={className}
      title="Price"
      sub={`USD · ${FUND_INTERVAL_WORDS[interval]} candles${asset.estimated ? " · estimated index" : ""}`}
      value={price(asset.price)}
      change={candlesChange(candles)}
      changeLabel={rangeLabel(candles)}
      controls={<TimeframeTabs<FundCandleInterval> value={interval} onChange={setIv} options={FUND_INTERVALS} labels={FUND_INTERVAL_LABEL} label="Candle interval" />}
      footnote={asset.estimated ? "Startups move with AI-scored news (at most 10% a day) and reset on a new funding round." : "Real prices every 5 minutes; when markets are closed the last price holds."}
    >
      <Crossfade value={interval}>
        {!q.data && q.isPending ? (
          <div className="skeleton h-[300px] rounded-control" aria-hidden />
        ) : candles.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center">
            <EmptyState icon="index" title="No price history yet" body="Candles fill in as the price service records prices." compact />
          </div>
        ) : (
          <CandleChartCanvas candles={candles} interval={chartInterval(interval)} ticker={asset.id} height={300} animateKey={`${asset.id}:${interval}`} />
        )}
      </Crossfade>
    </ChartCard>
  );
}

function HeldByCard({ asset, className }: { asset: AssetDetail; className?: string }) {
  const rows = [...asset.heldBy].sort((a, b) => b.bps - a.bps);
  return (
    <Card as="section" aria-labelledby="heldby-h" className={cn("flex flex-col", className)}>
      <CardHeader id="heldby-h" title="Which funds hold it" subtitle="Weight after each fund's last reveal" />
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-body-sm text-ink-2">No fund holds {asset.name} right now. A manager can add it at any rebalance bell.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((h) => (
              <li key={h.fund}>
                <Link href={`/app/f/${h.fund}`} transitionTypes={[...NAV.forward]} className="flex min-h-14 items-center gap-3 rounded-control py-2 outline-none hover:opacity-80 focus-visible:outline-2 focus-visible:outline-brand">
                  <FundMark fund={h.fund} size={32} />
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-ink">{fundName(h.fund)}</span>
                  <span className="flex items-center gap-2">
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-fill sm:block" aria-hidden>
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (h.bps / 2500) * 100)}%` }} />
                    </span>
                    <span className="num w-12 text-right text-body-sm font-medium text-ink">{bps(h.bps)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line px-5 py-4 text-caption md:px-6">
        <div>
          <dt className="text-ink-3">Basket</dt>
          <dd className="text-body-sm font-medium text-ink">{basketLabel(asset.basket)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Kind</dt>
          <dd className="text-body-sm font-medium text-ink">{asset.kind === "startup" ? "Private startup" : asset.region === "india" ? "Listed in India" : "Listed in the US"}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Currency</dt>
          <dd className="num text-body-sm font-medium text-ink">
            {asset.currency === "INR" && asset.localPrice !== null ? `₹${asset.localPrice.toFixed(2)}` : asset.currency}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Held by</dt>
          <dd className="num text-body-sm font-medium text-ink">
            {rows.length} of 5 funds
          </dd>
        </div>
      </dl>
    </Card>
  );
}

const SENTIMENT: Record<number, { label: string; cls: string }> = {
  [-2]: { label: "Very negative", cls: "bg-down-soft text-down" },
  [-1]: { label: "Negative", cls: "bg-down-soft text-down" },
  0: { label: "Neutral", cls: "bg-fill text-ink-2" },
  1: { label: "Positive", cls: "bg-up-soft text-up" },
  2: { label: "Very positive", cls: "bg-up-soft text-up" },
};

function NewsCard({ asset, className }: { asset: AssetDetail; className?: string }) {
  const now = useNow(60_000);
  return (
    <Card as="section" aria-labelledby="news-h" className={className}>
      <CardHeader id="news-h" title="News naming it" subtitle="Headlines the managers read, scored by AI" />
      <CardBody>
        {asset.news.length === 0 ? (
          <p className="text-body-sm text-ink-2">No headlines naming {asset.name} in the last day.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {asset.news.slice(0, 12).map((n) => {
              const s = n.sentiment === null ? null : SENTIMENT[n.sentiment];
              return (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-body-sm font-medium text-ink hover:underline">
                      {n.title}
                    </a>
                    {n.reason && <p className="mt-0.5 text-caption text-ink-2">{n.reason}</p>}
                    <p className="mt-1 flex items-center gap-2 text-caption text-ink-3">
                      <span>{n.domain}</span>
                      <TimeAgo at={n.publishedAt} now={now} fixed={false} />
                    </p>
                  </div>
                  {s && <span className={cn("inline-flex h-6 shrink-0 items-center rounded-chip px-2 text-caption font-medium", s.cls)}>{s.label}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ValuationCard({ asset, className }: { asset: AssetDetail; className?: string }) {
  const v = asset.valuation;
  return (
    <Card as="section" aria-labelledby="val-h" className={className}>
      <CardHeader id="val-h" title={<Term id="estimated">How it&apos;s estimated</Term>} subtitle="Index 100 = the last funding round" />
      <CardBody>
        {v ? (
          <dl className="divide-y divide-line">
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-body-sm text-ink-2">Last valuation</dt>
              <dd className="num text-body-sm font-medium text-ink">{usd(v.usd, { compact: true })}</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-body-sm text-ink-2">Round date</dt>
              <dd className="num text-body-sm font-medium text-ink">{formatDay(v.date)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-body-sm text-ink-2">The valuation basis appears once the price service has verified it.</p>
        )}
        {(asset.sources.length > 0 || v) && (
          <ul className="mt-3 flex flex-col gap-1">
            {[...(v ? [v.source] : []), ...asset.sources].map((s, i) => (
              <li key={`${s.url}-${i}`}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-label font-medium text-brand hover:underline">
                  {s.label} <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function AssetSkeleton() {
  return (
    <LoadingRegion label="Loading the asset" className="flex flex-col gap-4 lg:gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <ChartCardSkeleton height={300} value className="lg:col-span-8" />
        <Card padded className="flex flex-col gap-3 lg:col-span-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
    </LoadingRegion>
  );
}
