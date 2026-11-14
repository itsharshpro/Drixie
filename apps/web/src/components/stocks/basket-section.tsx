"use client";

import type { AssetBasket, BasketId } from "@listed/shared";
import { cn } from "@/lib/cn";
import { bps, pct } from "@/lib/funds/format";
import { fundName } from "@/lib/funds/meta";
import { Halftone, halftoneHost } from "../trading/halftone";
import { FundMark } from "../funds/fund-mark";
import { AnimatedItem, AnimatedList } from "../ui/transitions";
import { AssetCard, AssetCardSkeleton } from "./asset-card";
import { basketLook } from "./basket-meta";

export function basketExposure(b: Pick<AssetBasket, "assets">): { fund: string; bps: number }[] {
  const by = new Map<string, number>();
  for (const a of b.assets) for (const h of a.heldBy) by.set(h.fund, (by.get(h.fund) ?? 0) + h.bps);
  return [...by.entries()].map(([fund, v]) => ({ fund, bps: v })).sort((x, y) => y.bps - x.bps);
}

export function basketMove(b: Pick<AssetBasket, "assets">): number | null {
  const v = b.assets.map((a) => a.change1d).filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

function Fact({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-paper/80 px-3 text-caption font-medium text-ink shadow-[0_0_0_1px_var(--line)]", className)}>{children}</span>;
}

export function BasketSection({ id, label, basket }: { id: BasketId; label: string; basket: AssetBasket | null }) {
  const look = basketLook(id);
  const Icon = look.icon;
  const assets = basket?.assets ?? [];
  const held = assets.filter((a) => a.heldBy.length > 0).length;
  const move = basket ? basketMove(basket) : null;
  const top = basket ? basketExposure(basket)[0] : undefined;
  return (
    <section aria-labelledby={`basket-${id}`} className={cn(halftoneHost, "@container relative min-w-0 overflow-hidden rounded-card p-5 shadow-e1 md:p-6")} style={{ background: look.pastel }}>
      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-paper shadow-[0_0_0_1px_var(--line)]" aria-hidden>
            <Icon className="size-5 text-ink" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h2 id={`basket-${id}`} className="truncate text-title-sm font-semibold tracking-[-0.01em] text-ink">
              {label}
            </h2>
            <p className="truncate text-caption text-ink-2">{look.line}</p>
          </div>
        </div>
        {assets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Fact>
              <span className="num">{assets.length}</span> assets
            </Fact>
            <Fact>
              <span className="num">{held}</span> held
            </Fact>
            <Fact>
              <span className="text-ink-2">Avg 1d</span>
              <span className={cn("num", move === null || Math.abs(move) < 0.05 ? "text-ink-2" : move > 0 ? "text-up" : "text-down")}>{pct(move)}</span>
            </Fact>
            {top && (
              <Fact className="pl-1.5">
                <FundMark fund={top.fund} size={24} />
                <span className="text-ink-2">Biggest bet</span>
                <span>{fundName(top.fund)}</span>
                <span className="num">{bps(top.bps, 0)}</span>
              </Fact>
            )}
          </div>
        )}
      </div>
      <Halftone className="-mx-5 mb-4 mt-3 w-auto md:-mx-6" rows={3} cell={10} color={look.tone} opacity={0.32} fade="down" />
      {assets.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-[16px] border border-line bg-paper px-6 py-10 text-center">
          <p className="text-title-sm font-semibold text-ink">{id === "crypto" ? "No crypto prices yet" : "No prices yet"}</p>
          <p className="max-w-96 text-body-sm text-ink-2">
            {id === "crypto"
              ? "BTC, ETH, SOL and NEAR appear here once the price feed records them. They trade around the clock."
              : "The price service fills this basket every 5 minutes from real markets."}
          </p>
        </div>
      ) : (
        <AnimatedList className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3 @[90rem]:grid-cols-4">
          {assets.map((a, i) => (
            <AnimatedItem key={a.id} index={i} className="min-w-0">
              <AssetCard asset={a} className="h-full" />
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}
    </section>
  );
}

export function BasketSectionSkeleton({ id }: { id: BasketId }) {
  const look = basketLook(id);
  return (
    <div className="rounded-card p-5 md:p-6" style={{ background: look.pastel }} aria-hidden>
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-[12px] bg-paper/70" />
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-28 rounded-full bg-paper/70" />
          <div className="h-3 w-44 rounded-full bg-paper/60" />
        </div>
      </div>
      <div className="mt-[54px] grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <AssetCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
