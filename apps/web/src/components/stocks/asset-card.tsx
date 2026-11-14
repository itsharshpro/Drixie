"use client";

import type { Asset } from "@listed/shared";
import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { toCandles } from "@/lib/funds/candles";
import { useAssetCandles } from "@/lib/funds/queries";
import { useInView } from "@/lib/hooks/use-in-view";
import { MiniCandles } from "../trading/mini-candles";
import { Badge } from "../ui/badge";
import { ChangeChip } from "../ui/change-chip";
import { CompanyMark } from "../ui/company-mark";
import { NAV, SharedElement } from "../ui/transitions";
import { HeldByStack } from "./held-by";
import { LivePrice } from "./live-price";

export const assetHref = (id: string) => `/app/s/${encodeURIComponent(id)}`;

export function cardInterval(a: Pick<Asset, "kind">): "1h" | "15m" | "1d" {
  if (a.kind === "crypto") return "15m";
  if (a.kind === "startup") return "1d";
  return "1h";
}

export function AssetCard({ asset: a, className }: { asset: Asset; className?: string }) {
  const [ref, seen] = useInView<HTMLAnchorElement>("240px");
  const iv = cardInterval(a);
  const q = useAssetCandles(a.id, iv, seen);
  const candles = useMemo(() => toCandles(q.data?.candles).slice(-24), [q.data]);
  const words = iv === "1d" ? "daily" : iv === "15m" ? "15-minute" : "hourly";
  return (
    <Link
      ref={ref}
      href={assetHref(a.id)}
      transitionTypes={[...NAV.forward]}
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 rounded-[16px] border border-line bg-paper p-4 text-left shadow-e1 outline-none",
        "transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-0.5 hover:shadow-e2 active:scale-[0.98] active:duration-[120ms]",
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <SharedElement kind="company-mark" id={a.id}>
          <CompanyMark ticker={a.id} size={32} />
        </SharedElement>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-body-sm font-semibold text-ink">{a.name}</span>
            {a.estimated && <Badge tone="gold" className="h-5 px-2">est.</Badge>}
          </p>
          <p className="num truncate text-caption text-ink-3">{a.id}</p>
        </div>
        <ChangeChip value={a.change1d} size="sm" />
      </div>
      <div className="flex min-w-0 items-baseline gap-2">
        <LivePrice value={a.price} className="text-title-sm font-semibold tracking-[-0.01em] text-ink" label={`${a.name} price ${a.price ?? "unknown"} dollars`} />
        {a.currency === "INR" && a.localPrice !== null && <span className="num text-caption text-ink-3">₹{a.localPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>}
      </div>
      <MiniCandles
        candles={candles}
        count={24}
        height={44}
        interval={iv === "1d" ? "1D" : iv === "15m" ? "5m" : "1h"}
        tooltip={false}
        focusable={false}
        loading={!seen || (!q.data && q.isPending)}
        emptyLabel="No candles yet"
        label={`${a.name} ${words} candles`}
      />
      <div className="border-t border-line pt-3">
        <HeldByStack rows={a.heldBy} />
      </div>
    </Link>
  );
}

export function AssetCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-paper p-4" aria-hidden>
      <div className="flex items-center gap-3">
        <div className="skeleton size-8 rounded-[8px]" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="skeleton h-3.5 w-24 rounded-full" />
          <div className="skeleton h-3 w-12 rounded-full" />
        </div>
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
      <div className="skeleton h-6 w-24 rounded-full" />
      <div className="skeleton h-11 w-full rounded-[8px]" />
      <div className="skeleton h-6 w-32 rounded-full" />
    </div>
  );
}
