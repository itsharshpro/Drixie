"use client";

import type { Asset, AssetBasket, AssetsResponse, BasketId } from "@listed/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { toCandles } from "@/lib/funds/candles";
import { bps, price } from "@/lib/funds/format";
import { fundName } from "@/lib/funds/meta";
import { useAssetCandles, useAssets } from "@/lib/funds/queries";
import { useInView } from "@/lib/hooks/use-in-view";
import { useIsPhone } from "@/lib/hooks/use-media";
import { MiniCandles } from "../trading/mini-candles";
import { Badge } from "../ui/badge";
import { Card, CARD_TITLE } from "../ui/card";
import { ChangeChip } from "../ui/change-chip";
import { Chip } from "../ui/chip";
import { CompanyMark } from "../ui/company-mark";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { HScroll } from "../ui/hscroll";
import { PageHeader } from "../ui/page-header";
import { LoadingRegion, Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { TimeAgo } from "../ui/time-ago";
import { Tooltip } from "../ui/tooltip";
import { Crossfade, NAV, Reveal, useTransitionState } from "../ui/transitions";
import { FundMark } from "./fund-mark";

const FORWARD = [...NAV.forward];
type Filter = "all" | BasketId;

export const assetHref = (id: string) => `/app/s/${encodeURIComponent(id)}`;

export function StocksScreen() {
  const q = useAssets();
  const [filter, setFilter] = useTransitionState<Filter>("all");
  return (
    <>
      <PageHeader
        title="Stocks"
        subtitle={
          <>
            Every stock and startup the funds can hold, in 8 baskets, with real prices. Startups are <Term id="estimated">estimated</Term>.
          </>
        }
        back={false}
      />
      {q.isError && !q.data ? (
        <div className="pt-10">
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} />
        </div>
      ) : (
        <Reveal ready={!!q.data} fallback={<StocksSkeleton />}>
          {() => <StocksBody data={q.data!} filter={filter} setFilter={setFilter} />}
        </Reveal>
      )}
    </>
  );
}

function StocksBody({ data, filter, setFilter }: { data: AssetsResponse; filter: Filter; setFilter: (f: Filter) => void }) {
  const baskets = data.baskets.filter((b) => b.assets.length > 0);
  const shown = filter === "all" ? baskets : baskets.filter((b) => b.id === filter);
  const total = baskets.reduce((s, b) => s + b.assets.length, 0);
  if (!total) {
    return (
      <Card>
        <EmptyState icon="index" title="No prices yet" body="The price service fills this in every 5 minutes from real markets. Check back shortly." />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <Card padded className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <CompanyMark ticker={data.benchmark.symbol} size={40} />
          <div className="min-w-0">
            <p className="text-caption font-medium text-ink-3">
              Benchmark · <Term id="benchmark">beat the market</Term>
            </p>
            <p className="flex flex-wrap items-baseline gap-2">
              <span className="text-body font-semibold text-ink">{data.benchmark.symbol}</span>
              <span className="num text-body font-medium text-ink">{price(data.benchmark.price)}</span>
              <ChangeChip value={data.benchmark.change1d} size="sm" />
            </p>
          </div>
        </div>
        <p className="text-caption text-ink-3">
          <span className="num text-ink-2">{total}</span> assets · prices every 5 minutes
          {data.updatedAt && (
            <>
              {" · updated "}
              <TimeAgo at={data.updatedAt} fixed={false} />
            </>
          )}
          . Markets closed: the last price holds.
        </p>
      </Card>
      <nav aria-label="Baskets">
        <HScroll className="-mx-4 px-1 md:-mx-3 md:px-0" innerClassName="gap-2">
          <Chip selected={filter === "all"} onClick={() => setFilter("all")} count={total}>
            All
          </Chip>
          {baskets.map((b) => (
            <Chip key={b.id} selected={filter === b.id} onClick={() => setFilter(b.id)} count={b.assets.length}>
              {b.label}
            </Chip>
          ))}
        </HScroll>
      </nav>
      <Crossfade value={filter} className="flex flex-col gap-4 lg:gap-6">
        {shown.map((b) => (
          <BasketCard key={b.id} basket={b} />
        ))}
      </Crossfade>
    </div>
  );
}

function HeldBy({ asset, max = 5 }: { asset: Asset; max?: number }) {
  if (!asset.heldBy.length) return <span className="text-caption text-ink-3">No fund yet</span>;
  return (
    <span className="flex items-center gap-1">
      {asset.heldBy.slice(0, max).map((h) => (
        <Tooltip key={h.fund} content={`${fundName(h.fund)} · ${bps(h.bps)}`}>
          <span className="inline-flex">
            <FundMark fund={h.fund} size={24} />
          </span>
        </Tooltip>
      ))}
    </span>
  );
}

function RowCandles({ id }: { id: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const q = useAssetCandles(id, "1h", seen);
  const candles = useMemo(() => toCandles(q.data?.candles).slice(-24), [q.data]);
  return (
    <div ref={ref}>
      <MiniCandles
        candles={candles}
        count={24}
        height={32}
        loading={!seen || (!q.data && q.isPending)}
        interval="1h"
        tooltip={false}
        focusable={false}
        emptyLabel="No prices yet"
        label={`${id} hourly candles, last 24 hours`}
      />
    </div>
  );
}

function forwardRowClick(e: MouseEvent, link: HTMLAnchorElement | null): void {
  const target = e.target as HTMLElement;
  if (target.closest("a,button,[role=button]")) return;
  if (window.getSelection()?.toString()) return;
  link?.click();
}

function AssetRow({ a }: { a: Asset }) {
  const ref = useRef<HTMLAnchorElement>(null);
  return (
    <tr
      onClick={(e) => forwardRowClick(e, ref.current)}
      className="group cursor-pointer border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-fill/70 has-[a:focus-visible]:bg-fill"
    >
      <td className="py-2.5 pl-5 md:pl-6">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyMark ticker={a.id} size={32} />
          <Link ref={ref} href={assetHref(a.id)} transitionTypes={FORWARD} className="flex min-h-11 min-w-0 flex-col justify-center outline-none">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium text-ink">{a.name}</span>
              {a.estimated && <Badge tone="gold">est.</Badge>}
            </span>
            <span className="num truncate text-caption text-ink-3">{a.id}</span>
          </Link>
        </div>
      </td>
      <td className="py-2.5 pr-3 text-right">
        <div className="flex flex-col items-end">
          <span className="num font-medium text-ink">{price(a.price)}</span>
          {a.currency === "INR" && a.localPrice !== null && <span className="num text-caption text-ink-3">₹{a.localPrice.toFixed(2)}</span>}
        </div>
      </td>
      <td className="py-2.5 pr-3 text-right">
        <ChangeChip value={a.change1d} size="sm" />
      </td>
      <td className="hidden py-2.5 pr-3 @xl:table-cell">
        <HeldBy asset={a} />
      </td>
      <td className="hidden w-[132px] py-2 pl-2 pr-3 @3xl:table-cell">
        <RowCandles id={a.id} />
      </td>
      <td className="w-10 py-2.5 pr-4 text-ink-3">
        <ChevronRight className="size-4 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.5} aria-hidden />
      </td>
    </tr>
  );
}

function AssetCardRow({ a }: { a: Asset }) {
  return (
    <li>
      <Link href={assetHref(a.id)} transitionTypes={FORWARD} className="flex items-center gap-3 px-5 py-3 outline-none active:bg-fill focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand">
        <CompanyMark ticker={a.id} size={32} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-body-sm font-medium text-ink">{a.name}</span>
            {a.estimated && <Badge tone="gold">est.</Badge>}
          </span>
          <span className="flex items-center gap-2 text-caption text-ink-3">
            <span className="num">{a.id}</span>
            <HeldBy asset={a} max={3} />
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="num text-body-sm font-medium text-ink">{price(a.price)}</span>
          <ChangeChip value={a.change1d} size="sm" />
        </span>
      </Link>
    </li>
  );
}

function BasketCard({ basket }: { basket: AssetBasket }) {
  const phone = useIsPhone();
  const held = basket.assets.filter((a) => a.heldBy.length > 0).length;
  return (
    <Card as="section" aria-labelledby={`b-${basket.id}`} className="@container overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 md:px-6 md:pt-6">
        <div className="min-w-0">
          <h2 id={`b-${basket.id}`} className={CARD_TITLE}>
            {basket.label}
          </h2>
          <p className="text-caption text-ink-3">
            <span className="num">{basket.assets.length}</span> assets · <span className="num">{held}</span> held by a fund
          </p>
        </div>
      </div>
      {phone ? (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {basket.assets.map((a) => (
            <AssetCardRow key={a.id} a={a} />
          ))}
        </ul>
      ) : (
        <table className="w-full table-fixed border-collapse text-body-sm">
          <thead>
            <tr className="border-y border-line text-left text-caption font-medium text-ink-3">
              <th scope="col" className="py-2.5 pl-5 font-medium md:pl-6">
                Asset
              </th>
              <th scope="col" className="w-[112px] py-2.5 pr-3 text-right font-medium">
                Price
              </th>
              <th scope="col" className="w-[92px] py-2.5 pr-3 text-right font-medium">
                1d
              </th>
              <th scope="col" className="hidden w-[148px] py-2.5 pr-3 font-medium @xl:table-cell">
                Held by
              </th>
              <th scope="col" className="hidden w-[132px] py-2.5 pl-2 pr-3 font-medium @3xl:table-cell">
                Hourly · 24h
              </th>
              <th scope="col" className="w-10 py-2.5 pr-4">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {basket.assets.map((a) => (
              <AssetRow key={a.id} a={a} />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function StocksSkeleton() {
  return (
    <LoadingRegion label="Loading the stocks" className="flex flex-col gap-4 lg:gap-6">
      <Skeleton className="h-[88px] w-full rounded-card" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="flex flex-col gap-2 px-5 pb-3 pt-5 md:px-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          {Array.from({ length: 5 }, (_, j) => (
            <div key={j} className={cn("flex h-[61px] items-center gap-3 border-t border-line px-5 md:px-6")}>
              <Skeleton className="size-8 rounded-[8px]" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="ml-auto h-3.5 w-16" />
            </div>
          ))}
        </Card>
      ))}
    </LoadingRegion>
  );
}
