"use client";

import type { SeatAuction } from "@listed/shared";
import { nearToYocto, yoctoToNear } from "@listed/shared";
import { useState, type FormEvent } from "react";
import { useSession } from "@/lib/auth/session";
import { useBalance } from "@/lib/chain/views";
import { until, usd } from "@/lib/funds/format";
import { useBidSeat, useSettleSeat } from "@/lib/funds/mutations";
import { useNow } from "@/lib/hooks/use-now";
import { AccountCta } from "../ui/account-cta";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { Sheet } from "../ui/sheet";
import { useGameRate } from "./order-sheet";

export function SeatBidSheet({
  open,
  onOpenChange,
  fund,
  name,
  auction,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fund: string;
  name: string;
  auction: SeatAuction;
}) {
  const session = useSession();
  const rate = useGameRate();
  const now = useNow(1000);
  const balance = useBalance(session.status === "ready" ? session.accountId : null);
  const bid = useBidSeat();
  const settle = useSettleSeat();
  const top = auction.highBid ? yoctoToNear(auction.highBid) : 0;
  const min = top > 0 ? Number((top * 1.05).toFixed(2)) : 0.1;
  const [value, setValue] = useState(String(min));
  const n = Number(value);
  const have = balance.data ? yoctoToNear(balance.data) - 0.05 : null;
  const ended = !!auction.endsAt && now !== null && Date.parse(auction.endsAt) <= now;
  const error = !Number.isFinite(n) || n < min ? `Bid at least ${min} NEAR.` : have !== null && n > have ? `You have about ${have.toFixed(2)} NEAR.` : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (error) return;
    bid.mutate({ fund, fundName: name, yocto: nearToYocto(String(n)), label: `${n} NEAR (${usd(n * rate)})` }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`${name} manager seat`} description="The seat earns 30% of the fees on investors' money in this fund.">
      {ended ? (
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-ink-2">This auction has ended. Anyone can settle it: the top bidder gets the seat.</p>
          <Button loading={settle.isPending} loadingLabel="Settling" onClick={() => settle.mutate({ fund, fundName: name }, { onSuccess: () => onOpenChange(false) })} disabled={session.status !== "ready"}>
            Settle the auction
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <dl className="flex flex-col gap-2 rounded-control bg-fill p-4 text-body-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Top bid</dt>
              <dd className="num font-medium text-ink">{top > 0 ? `${top.toFixed(2)} NEAR` : "No bids yet"}</dd>
            </div>
            {auction.endsAt && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Ends</dt>
                <dd className="font-medium text-ink">
                  <span className="num">{until(auction.endsAt, now)}</span>
                </dd>
              </div>
            )}
          </dl>
          <Field label="Your bid (NEAR)" error={value ? error : null} helper={`At least ${min} NEAR · ${usd((Number.isFinite(n) ? n : 0) * rate)} at the game rate`}>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Bid in NEAR" />
          </Field>
          <AccountCta type="submit" verb="bid" need="key" block loading={bid.isPending} loadingLabel="Bidding">
            Place bid
          </AccountCta>
          <p className="text-caption text-ink-3">If someone outbids you, your NEAR comes back automatically. Testnet NEAR only.</p>
        </form>
      )}
    </Sheet>
  );
}
