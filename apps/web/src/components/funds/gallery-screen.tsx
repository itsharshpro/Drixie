"use client";

import type { FundNft, FundNftKind, FundRow } from "@listed/shared";
import { yoctoToNear } from "@listed/shared";
import { Gavel } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/format";
import { nftImageUrl } from "@/lib/funds/api";
import { nearToUsd, until, usd } from "@/lib/funds/format";
import { fundName } from "@/lib/funds/meta";
import { useFund, useFunds, useNfts } from "@/lib/funds/queries";
import { useNow } from "@/lib/hooks/use-now";
import { AccountCta } from "../ui/account-cta";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Chip } from "../ui/chip";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { HScroll } from "../ui/hscroll";
import { LoadMore } from "../ui/load-more";
import { PageHeader } from "../ui/page-header";
import { Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { AnimatedItem, AnimatedList, Crossfade, transition } from "../ui/transitions";
import { FundIdentity } from "./fund-mark";
import { useGameRate } from "./order-sheet";
import { SeatBidSheet } from "./seat-sheet";

export function GalleryScreen() {
  const funds = useFunds();
  const rows = funds.data?.items ?? [];
  return (
    <>
      <PageHeader
        title="Gallery"
        subtitle={
          <>
            Every NFT in the arena: <Term id="seat">manager seats</Term> and their auctions, <Term id="basket-card">basket cards</Term>, badges and trophies.
          </>
        }
        back={false}
      />
      <div className="flex flex-col gap-4 lg:gap-6">
        <section id="seats" aria-labelledby="seats-h" className="flex scroll-mt-24 flex-col gap-3">
          <div>
            <h2 id="seats-h" className="text-title-sm font-semibold tracking-[-0.01em] text-ink">
              Manager seats
            </h2>
            <p className="text-body-sm text-ink-2">Each seat earns 30% of the fees on investors&apos; money in its fund.</p>
          </div>
          {!funds.data ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-[214px] rounded-card" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState icon="auctions" title="No seats yet" body="Five seats are auctioned when the funds launch." compact />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 xl:grid-cols-5">
              {rows.map((f) => (
                <SeatTile key={f.id} f={f} />
              ))}
            </div>
          )}
        </section>
        <BasketCards rows={rows} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <NftGridCard kind="badge" title={<Term id="badge">Investor badges</Term>} subtitle="Soulbound: early backer, kept faith, held through a black-swan day, backed the winner" empty="No badges minted yet. The first 100 investors in each fund get Early backer." />
          <NftGridCard kind="trophy" title={<Term id="trophy">Trophies</Term>} subtitle="Manager of the Year, minted to the winner's seat owner" empty="The first trophy is minted when this season settles." />
        </div>
      </div>
    </>
  );
}

function SeatTile({ f }: { f: FundRow }) {
  const d = useFund(f.id);
  const rate = useGameRate();
  const [open, setOpen] = useState(false);
  const now = useNow(30_000);
  const seat = d.data?.seat ?? null;
  const auction = seat?.auction ?? null;
  return (
    <Card padded className="flex flex-col gap-4">
      <FundIdentity fund={f.id} name={f.name} size="md" href={`/app/f/${f.id}#seat`} sub={auction?.open ? "Seat auction open" : "Manager seat"} />
      {!d.data ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <dl className="flex flex-col gap-1.5 text-body-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-2">{auction?.open ? "Top bid" : "Owner"}</dt>
            <dd className="num min-w-0 truncate font-medium text-ink">
              {auction?.open ? (auction.highBid ? `${yoctoToNear(auction.highBid).toFixed(2)} NEAR` : "No bids") : seat?.owner ? seat.owner.split(".")[0] : "Unsold"}
            </dd>
          </div>
          {auction?.open && auction.endsAt ? (
            <div className="flex justify-between gap-2">
              <dt className="text-ink-2">Ends</dt>
              <dd className="font-medium text-ink">
                <span className="num">{until(auction.endsAt, now)}</span>
              </dd>
            </div>
          ) : (
            <div className="flex justify-between gap-2">
              <dt className="text-ink-2">Fees earned</dt>
              <dd className="num font-medium text-ink">{seat ? usd(nearToUsd(seat.feesEarned, rate)) : "—"}</dd>
            </div>
          )}
        </dl>
      )}
      {auction?.open && (
        <>
          <AccountCta verb="bid" need="key" block variant="secondary" className="mt-auto" icon={<Gavel className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
            {auction.endsAt && now !== null && Date.parse(auction.endsAt) <= now ? "Settle" : "Bid"}
          </AccountCta>
          <SeatBidSheet open={open} onOpenChange={setOpen} fund={f.id} name={f.name} auction={auction} />
        </>
      )}
    </Card>
  );
}

function NftImage({ nft, className }: { nft: FundNft; className?: string }) {
  return (
    <div className={cn("aspect-[4/5] overflow-hidden rounded-control border border-line bg-paper", className)}>
      <img src={nftImageUrl(nft.imageUrl)} alt={nft.title} className="size-full object-cover" loading="lazy" decoding="async" />
    </div>
  );
}

function BasketCards({ rows }: { rows: FundRow[] }) {
  const [fund, setFund] = useState<string | null>(null);
  const q = useNfts({ kind: "basket", fund: fund ?? undefined });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card as="section" aria-labelledby="cards-h" className="px-5 pb-5 pt-5 md:px-6 md:pt-6">
      <div className="flex flex-col gap-3">
        <div>
          <h2 id="cards-h" className="text-[15px] font-semibold leading-[22px] tracking-[-0.005em] text-ink">
            Basket cards
          </h2>
          <p className="text-caption text-ink-3">One edition per reveal: the 10 weights, NAV and bell. Many cards mean a lot of churn.</p>
        </div>
        {rows.length > 0 && (
          <HScroll className="-mx-5 px-4 md:-mx-6 md:px-5" innerClassName="gap-2">
            <Chip selected={fund === null} onClick={() => transition(() => setFund(null))}>
              All funds
            </Chip>
            {rows.map((f) => (
              <Chip key={f.id} selected={fund === f.id} onClick={() => transition(() => setFund(f.id))}>
                {f.name}
              </Chip>
            ))}
          </HScroll>
        )}
      </div>
      <Crossfade value={fund ?? "all"} className="mt-4">
        {q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
        ) : !q.data ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-control" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="auctions" title="No basket cards yet" body="A card is minted at every reveal that changes the weights." compact />
        ) : (
          <>
            <AnimatedList as="ul" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {items.map((n, i) => (
                <AnimatedItem as="li" key={n.tokenId} index={i} className="flex flex-col gap-2">
                  <NftImage nft={n} />
                  <div className="min-w-0">
                    <p className="truncate text-caption font-medium text-ink">
                      {n.fund ? fundName(n.fund) : n.title} {n.edition !== null && <span className="num text-ink-3">#{n.edition}</span>}
                    </p>
                    <p className="text-caption text-ink-3">
                      {n.bell !== null ? (
                        <>
                          Bell <span className="num">{n.bell}</span> ·{" "}
                        </>
                      ) : null}
                      {formatDay(n.mintedAt)}
                    </p>
                  </div>
                </AnimatedItem>
              ))}
            </AnimatedList>
            <LoadMore onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} hasMore={q.hasNextPage} label="Show more cards" className="mt-3" />
          </>
        )}
      </Crossfade>
    </Card>
  );
}

function NftGridCard({ kind, title, subtitle, empty }: { kind: FundNftKind; title: ReactNode; subtitle: string; empty: string }) {
  const q = useNfts({ kind });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card as="section" aria-label={kind === "badge" ? "Investor badges" : "Trophies"}>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody>
        {!q.data ? (
          <div className="grid grid-cols-3 gap-3" aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-control" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-body-sm text-ink-2">{empty}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {items.slice(0, 12).map((n) => (
              <li key={n.tokenId} className="flex flex-col gap-1.5">
                <NftImage nft={n} />
                <p className="truncate text-caption font-medium text-ink">{n.title}</p>
                <p className="truncate text-caption text-ink-3">{n.owner.split(".")[0]}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
