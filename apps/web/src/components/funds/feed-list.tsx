"use client";

import type { FeedItem, FeedKind } from "@listed/shared";
import {
  ArrowLeftRight,
  Calculator,
  Coins,
  ExternalLink,
  Flame,
  Handshake,
  Images,
  Newspaper,
  ShieldCheck,
  Shuffle,
  Swords,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/funds/format";
import { useFeed } from "@/lib/funds/queries";
import { useNow } from "@/lib/hooks/use-now";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { HouseTag } from "../ui/house-tag";
import { LoadMore } from "../ui/load-more";
import { Skeleton } from "../ui/skeleton";
import { TimeAgo } from "../ui/time-ago";
import { AnimatedItem, AnimatedList, NAV } from "../ui/transitions";
import { VerifyLink } from "../ui/verify-link";
import { FundMark } from "./fund-mark";

export const FEED_ICON: Record<FeedKind, LucideIcon> = {
  move: Shuffle,
  flow: ArrowLeftRight,
  trade: Coins,
  raid: Swords,
  reputation: ShieldCheck,
  news: Newspaper,
  nav: Calculator,
  fee: Flame,
  promise: Handshake,
  season: Trophy,
  nft: Images,
};

export const FEED_LABEL: Record<FeedKind, string> = {
  move: "Moves",
  flow: "Money in and out",
  trade: "Coin trades",
  raid: "Raids",
  reputation: "Reputation",
  news: "News",
  nav: "NAV posts",
  fee: "Fees and burns",
  promise: "Promises",
  season: "Season",
  nft: "NFTs",
};

function Lead({ item }: { item: FeedItem }) {
  if (item.fund && item.kind !== "news") return <FundMark fund={item.fund} size={32} />;
  const Icon = FEED_ICON[item.kind] ?? Newspaper;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-fill text-ink-2" aria-hidden>
      <Icon className="size-4" strokeWidth={1.5} />
    </span>
  );
}

export function FeedRow({ item, now }: { item: FeedItem; now: number | null }) {
  const Icon = FEED_ICON[item.kind] ?? Newspaper;
  const body = (
    <>
      <Lead item={item} />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm text-ink">
          {item.title} <HouseTag account={item.account} />
        </p>
        {item.detail && <p className="mt-0.5 line-clamp-2 text-caption text-ink-2">{item.detail}</p>}
        <p className="mt-1 flex items-center gap-2 text-caption text-ink-3">
          <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
          <span>{FEED_LABEL[item.kind]}</span>
          {item.txHash && <VerifyLink txHash={item.txHash} />}
          {item.url && !item.txHash && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="-my-3.5 inline-flex min-h-11 items-center gap-1 font-medium text-brand hover:underline">
              Source <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <TimeAgo at={item.at} now={now} className="text-caption text-ink-3" />
        {item.usd !== null && Number.isFinite(item.usd) && (
          <span className={cn("num text-caption font-medium", item.usd > 0 ? "text-up" : item.usd < 0 ? "text-down" : "text-ink-2")}>
            {usd(item.usd, { signed: true, compact: Math.abs(item.usd) >= 100_000 })}
          </span>
        )}
      </div>
    </>
  );
  return <div className="flex items-start gap-3 py-3">{body}</div>;
}

export function FeedList({
  kinds,
  fund = null,
  first,
  empty,
  className,
  more = true,
}: {
  kinds: FeedKind[] | null;
  fund?: string | null;

  first?: number;
  empty: { title: string; body: string; action?: { label: string; href: string } };
  className?: string;
  more?: boolean;
}) {
  const q = useFeed(kinds, fund);
  const now = useNow(30_000);
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} compact />;
  if (!q.data) return <FeedSkeleton rows={first ?? 6} />;
  const items = q.data.pages.flatMap((p) => p.items);
  const shown = first ? items.slice(0, first) : items;
  if (!shown.length) return <EmptyState icon="activity" title={empty.title} body={empty.body} action={empty.action} compact />;
  return (
    <div className={className}>
      <AnimatedList as="ul" className="flex flex-col divide-y divide-line" aria-live="polite">
        {shown.map((item, i) => (
          <AnimatedItem as="li" key={item.id} index={i}>
            <FeedRow item={item} now={now} />
          </AnimatedItem>
        ))}
      </AnimatedList>
      {more && !first && (
        <LoadMore onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} hasMore={q.hasNextPage} className="mt-2" />
      )}
    </div>
  );
}

export function FeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="flex flex-col divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-3 py-3">
          <Skeleton className="size-8 rounded-[8px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-3 w-12" />
        </li>
      ))}
    </ul>
  );
}

export function FeedMoreLink({ href = "/app/economy", label = "See every move" }: { href?: string; label?: string }) {
  return (
    <Link href={href} transitionTypes={[...NAV.lateral]} className="inline-flex min-h-11 items-center text-label font-medium text-brand hover:underline">
      {label} →
    </Link>
  );
}
