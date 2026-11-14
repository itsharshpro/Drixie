"use client";

import type { FundDetail, FundOrder } from "@listed/shared";
import { nearToYocto, yoctoToNear } from "@listed/shared";
import { Clock } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { AddFundsLink } from "@/components/wallet/wallet-sheets";
import { useBalance } from "@/lib/chain/views";
import { cn } from "@/lib/cn";
import { coins, coinsToRaw, nearToUsd, price, usd, usdToNear } from "@/lib/funds/format";
import { MIN_SUBSCRIBE_NEAR } from "@/lib/funds/actions";
import { useCancelOrder, useRedeem, useSubscribe } from "@/lib/funds/mutations";
import { useFundPortfolio, useSeason } from "@/lib/funds/queries";
import { Countdown } from "../bell/countdown";
import { AccountCta } from "../ui/account-cta";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { Segmented } from "../ui/segmented";
import { Sheet } from "../ui/sheet";
import { Term } from "../ui/term";
import { TimeAgo } from "../ui/time-ago";
import { Crossfade } from "../ui/transitions";

type Side = "buy" | "sell";
const QUICK_USD = [50, 100, 250, 500];

const NEAR_RESERVE = 0.05;

export function useGameRate(): number {
  const season = useSeason();
  return season.data?.clock?.gameUsdPerNear ?? 100;
}

export function OrderSheet({
  open,
  onOpenChange,
  fund,
  initialSide = "buy",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fund: FundDetail;
  initialSide?: Side;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={side === "buy" ? `Buy into ${fund.name}` : `Cash out of ${fund.name}`}
      description={
        <>
          Fills at the next <Term id="nav">NAV</Term>, posted right after the bell in{" "}
          <Countdown to={fund.nextBellAt} className="font-medium text-ink" />.
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented
          label="Order side"
          block
          value={side}
          onChange={setSide}
          options={[
            { value: "buy", label: "Buy in" },
            { value: "sell", label: "Cash out" },
          ]}
        />
        <Crossfade value={side}>{side === "buy" ? <BuyForm fund={fund} onDone={() => onOpenChange(false)} /> : <SellForm fund={fund} onDone={() => onOpenChange(false)} />}</Crossfade>
        <PendingOrders fund={fund} />
        <p className="text-caption text-ink-3">
          A simulation priced off real markets. Coins are testnet tokens; nobody owns real shares. The game rate is set per season.
        </p>
      </div>
    </Sheet>
  );
}

function BuyForm({ fund, onDone }: { fund: FundDetail; onDone: () => void }) {
  const session = useSession();
  const rate = useGameRate();
  const balance = useBalance(session.status === "ready" ? session.accountId : null);
  const subscribe = useSubscribe();
  const [value, setValue] = useState("100");
  const [touched, setTouched] = useState(false);
  const amount = Number(value.replace(/,/g, ""));
  const balanceUsd = balance.data ? Math.max(0, (yoctoToNear(balance.data) - NEAR_RESERVE) * rate) : null;
  const minUsd = MIN_SUBSCRIBE_NEAR * rate;
  const error = !touched
    ? null
    : !Number.isFinite(amount) || amount <= 0
      ? "Enter an amount in dollars."
      : amount < minUsd
        ? `The smallest buy-in is ${usd(minUsd)}.`
      : balanceUsd !== null && amount > balanceUsd
        ? `You have about ${usd(balanceUsd)} to spend.`
        : null;
  const estCoins = Number.isFinite(amount) && amount > 0 && fund.nav > 0 ? amount / fund.nav : 0;
  const near = usdToNear(amount, rate);
  const disabled = fund.status === "liquidated";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!Number.isFinite(amount) || amount < minUsd || (balanceUsd !== null && amount > balanceUsd)) return;
    subscribe.mutate(
      { fund: fund.id, fundName: fund.name, yocto: nearToYocto(near), usdLabel: usd(amount) },
      { onSuccess: () => onDone() },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field
        label="Amount"
        error={error}
        helper={
          <>
            = <span className="num">{near}</span> testnet NEAR at ${rate} per NEAR
            {balanceUsd !== null && (
              <>
                {" · "}You have <span className="num">{usd(balanceUsd)}</span>
              </>
            )}
          </>
        }
      >
        <Input
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
          onBlur={() => setTouched(true)}
          leading={<span className="text-ink-3">$</span>}
          aria-label="Amount in dollars"
        />
      </Field>
      {balanceUsd !== null && Number.isFinite(amount) && amount > balanceUsd && <AddFundsLink className="-mt-2" />}
      <div className="flex flex-wrap gap-2">
        {QUICK_USD.map((q) => (
          <Button key={q} type="button" size="sm" variant="secondary" pill onClick={() => setValue(String(q))}>
            ${q}
          </Button>
        ))}
        {balanceUsd !== null && balanceUsd > 1 && (
          <Button type="button" size="sm" variant="ghost" pill onClick={() => setValue(balanceUsd.toFixed(2))}>
            Max
          </Button>
        )}
      </div>
      <dl className="flex flex-col gap-2 rounded-control bg-fill p-4 text-body-sm">
        <Line label="NAV now" value={price(fund.nav)} />
        <Line label="Coins at today's NAV" value={`≈ ${coins(estCoins)}`} />
        <Line label="Final price" value="The next NAV" muted />
      </dl>
      <AccountCta type="submit" verb="buy in" need="key" block loading={subscribe.isPending} loadingLabel="Placing order" disabled={disabled}>
        {disabled ? "This fund is closed" : `Buy in for ${Number.isFinite(amount) && amount > 0 ? usd(amount) : "$0"}`}
      </AccountCta>
    </form>
  );
}

function SellForm({ fund, onDone }: { fund: FundDetail; onDone: () => void }) {
  const session = useSession();
  const portfolio = useFundPortfolio(session.status === "ready" ? session.accountId : null);
  const redeem = useRedeem();
  const position = portfolio.data?.positions.find((p) => p.fund === fund.id) ?? null;
  const held = position?.coinsNum ?? 0;
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const n = Number(value.replace(/,/g, ""));
  const exitLoad = position?.exitLoadPct ?? (fund.reputation < 25 ? 0 : 1);
  const error = !touched ? null : !Number.isFinite(n) || n <= 0 ? "Enter how many coins." : n > held + 1e-9 ? `You hold ${coins(held)} coins.` : null;
  const est = Number.isFinite(n) && n > 0 ? n * fund.nav * (1 - exitLoad / 100) : 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const raw = position && n >= held - 1e-9 ? position.coins : coinsToRaw(value);
    if (!raw || n <= 0 || n > held + 1e-9) return;
    redeem.mutate(
      { fund: fund.id, fundName: fund.name, coinsRaw: raw, coinsLabel: coins(n) },
      { onSuccess: () => onDone() },
    );
  };

  if (session.status === "ready" && portfolio.data && held <= 0) {
    return (
      <div className="rounded-control bg-fill p-4 text-body-sm text-ink-2">
        You don&apos;t hold {fund.name} coins yet. Buy in first; you can cash out any time after it fills.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Coins to cash out" error={error} helper={position ? <>You hold <span className="num">{coins(held)}</span> coins</> : "Sign in to see your coins"}>
        <Input
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
          onBlur={() => setTouched(true)}
          trailing={
            position ? (
              <button type="button" className="min-h-11 px-2 text-label font-medium text-brand" onClick={() => setValue(String(Number(held.toFixed(6))))}>
                Max
              </button>
            ) : undefined
          }
          aria-label="Coins to cash out"
        />
      </Field>
      <dl className="flex flex-col gap-2 rounded-control bg-fill p-4 text-body-sm">
        <Line label="NAV now" value={price(fund.nav)} />
        <Line label={<Term id="cash-out">Exit load</Term>} value={`${exitLoad.toFixed(1)}%`} />
        <Line label="You get at today's NAV" value={`≈ ${usd(est)}`} />
      </dl>
      <AccountCta type="submit" verb="cash out" need="key" block variant="secondary" loading={redeem.isPending} loadingLabel="Placing order">
        Cash out {Number.isFinite(n) && n > 0 ? `${coins(n)} coins` : ""}
      </AccountCta>
    </form>
  );
}

function PendingOrders({ fund }: { fund: FundDetail }) {
  const session = useSession();
  const portfolio = useFundPortfolio(session.status === "ready" ? session.accountId : null);
  const cancel = useCancelOrder();
  const rate = useGameRate();
  const orders = useMemo(() => (portfolio.data?.pendingOrders ?? []).filter((o) => o.fund === fund.id), [portfolio.data, fund.id]);
  if (!orders.length) return null;
  return (
    <section aria-labelledby="pending-h" className="flex flex-col gap-2">
      <h3 id="pending-h" className="flex items-center gap-2 text-label font-medium text-ink-2">
        <Clock className="size-4" aria-hidden /> Waiting for the bell
      </h3>
      <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-body-sm text-ink">{orderLabel(o, rate)}</p>
              <p className="text-caption text-ink-3">
                Placed <TimeAgo at={o.queuedAt} fixed={false} />
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              loading={cancel.isPending && cancel.variables?.id === o.id}
              loadingLabel="Cancelling"
              onClick={() => cancel.mutate({ id: o.id, fund: o.fund })}
            >
              Cancel
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function orderLabel(o: FundOrder, rate: number): string {
  if (o.side === "subscribe") return `Buy in ${usd(o.amountUsd || nearToUsd(o.amount, rate))}`;
  return `Cash out ${coins(Number(o.amount) / 1e18)} coins`;
}

function Line({ label, value, muted }: { label: ReactNode; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={cn("num font-medium", muted ? "text-ink-2" : "text-ink")}>{value}</dd>
    </div>
  );
}
