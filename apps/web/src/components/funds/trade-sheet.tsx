"use client";

import type { FundDetail } from "@listed/shared";
import { nearToYocto, yoctoToNear } from "@listed/shared";
import { TriangleAlert } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { useBalance } from "@/lib/chain/views";
import { withSlippage, DEFAULT_SLIPPAGE_BPS } from "@/lib/chain/actions";
import { cn } from "@/lib/cn";
import { priceImpact, quoteSwap } from "@/lib/funds/actions";
import { coins, coinsToNumber, coinsToRaw, pct, price, usd, usdToNear } from "@/lib/funds/format";
import { useSwap } from "@/lib/funds/mutations";
import { useFundPortfolio } from "@/lib/funds/queries";
import { AccountCta } from "../ui/account-cta";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { Segmented } from "../ui/segmented";
import { Sheet } from "../ui/sheet";
import { Term } from "../ui/term";
import { PremiumTag } from "./bits";
import { useGameRate } from "./order-sheet";

type Side = "buy" | "sell";

export function TradeSheet({ open, onOpenChange, fund }: { open: boolean; onOpenChange: (o: boolean) => void; fund: FundDetail }) {
  const [side, setSide] = useState<Side>("buy");
  const session = useSession();
  const rate = useGameRate();
  const balance = useBalance(session.status === "ready" ? session.accountId : null);
  const portfolio = useFundPortfolio(session.status === "ready" ? session.accountId : null);
  const position = portfolio.data?.positions.find((p) => p.fund === fund.id) ?? null;
  const swap = useSwap();
  const [value, setValue] = useState("");
  const pool = fund.pool;
  const poolPrice = pool?.price ?? fund.coinPrice;

  const n = Number(value.replace(/,/g, ""));
  const valid = Number.isFinite(n) && n > 0;

  const amountIn = !valid ? "0" : side === "buy" ? nearToYocto(usdToNear(n, rate)) : (coinsToRaw(value) ?? "0");
  const out = quoteSwap(pool, side, amountIn);
  const outNum = side === "buy" ? coinsToNumber(out) : yoctoToNear(out) * rate;
  const impact = priceImpact(pool, side, amountIn, out);
  const avgUsd = !valid || outNum <= 0 ? null : side === "buy" ? n / outNum : outNum / n;
  const vsNav = avgUsd !== null && fund.nav > 0 ? (avgUsd / fund.nav - 1) * 100 : null;
  const minOut = withSlippage(out, DEFAULT_SLIPPAGE_BPS);
  const balanceUsd = balance.data ? Math.max(0, (yoctoToNear(balance.data) - 0.05) * rate) : null;
  const held = position?.coinsNum ?? 0;
  const over = valid && (side === "buy" ? balanceUsd !== null && n > balanceUsd : n > held + 1e-9);
  const noPool = !pool || BigInt(pool.coinReserve || "0") <= BigInt(0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || over || BigInt(out || "0") <= BigInt(0)) return;
    swap.mutate(
      {
        fund: fund.id,
        fundName: fund.name,
        side,
        amountIn,
        minOut,
        label: side === "buy" ? `${coins(outNum)} coins for ${usd(n)}` : `${coins(n)} coins for about ${usd(outNum)}`,
      },
      { onSuccess: () => setValue("") },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Trade the ${fund.name} coin`}
      description={
        <>
          Swap now in the coin&apos;s pool. Its price floats around <Term id="nav">NAV</Term>: <PremiumTag premium={fund.premium} />
        </>
      }
    >
      {noPool ? (
        <p className="rounded-control bg-fill p-4 text-body-sm text-ink-2">
          This coin&apos;s pool has no liquidity yet. You can still buy in at NAV.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Segmented
            label="Trade side"
            block
            value={side}
            onChange={(v) => {
              setSide(v);
              setValue("");
            }}
            options={[
              { value: "buy", label: "Buy coins" },
              { value: "sell", label: "Sell coins" },
            ]}
          />
          <Field
            label={side === "buy" ? "You pay" : "Coins to sell"}
            error={over ? (side === "buy" ? `You have about ${usd(balanceUsd)} to spend.` : `You hold ${coins(held)} coins.`) : null}
            helper={
              side === "buy" ? (
                <>
                  = <span className="num">{valid ? usdToNear(n, rate) : "0"}</span> testnet NEAR
                  {balanceUsd !== null && (
                    <>
                      {" · "}You have <span className="num">{usd(balanceUsd)}</span>
                    </>
                  )}
                </>
              ) : position ? (
                <>
                  You hold <span className="num">{coins(held)}</span> coins
                </>
              ) : (
                "Sign in to see your coins"
              )
            }
          >
            <Input
              inputMode="decimal"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
              leading={side === "buy" ? <span className="text-ink-3">$</span> : undefined}
              placeholder={side === "buy" ? "100" : "0"}
              aria-label={side === "buy" ? "Amount in dollars" : "Coins to sell"}
            />
          </Field>
          <dl className="flex flex-col gap-2 rounded-control bg-fill p-4 text-body-sm">
            <Line label="Pool price" value={price(poolPrice)} />
            <Line label="NAV" value={price(fund.nav)} />
            <Line label={side === "buy" ? "You get" : "You get about"} value={valid ? (side === "buy" ? `${coins(outNum)} coins` : usd(outNum)) : "—"} />
            <Line label="Your price per coin" value={avgUsd !== null ? price(avgUsd) : "—"} />
            <Line
              label={<Term id="premium">vs NAV</Term>}
              value={vsNav !== null ? pct(vsNav) : "—"}
              tone={vsNav === null ? undefined : side === "buy" ? (vsNav > 0.05 ? "text-down" : "text-up") : vsNav < -0.05 ? "text-down" : "text-up"}
            />
            <Line label="Price impact" value={impact !== null ? pct(impact).replace("+", "") : "—"} />
          </dl>
          {impact !== null && impact > 3 && (
            <p className="flex items-start gap-2 text-caption text-down">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              This trade moves the pool price by more than 3%. Try a smaller amount, or buy in at NAV.
            </p>
          )}
          <AccountCta type="submit" verb="trade" need="key" block loading={swap.isPending} loadingLabel={side === "buy" ? "Buying" : "Selling"} variant={side === "buy" ? "primary" : "secondary"}>
            {side === "buy" ? "Buy coins" : "Sell coins"}
          </AccountCta>
          <p className="text-caption text-ink-3">0.3% pool fee. You get at least 99% of the quote or the trade cancels. Coins are testnet tokens.</p>
        </form>
      )}
    </Sheet>
  );
}

function Line({ label, value, tone }: { label: ReactNode; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={cn("num font-medium text-ink", tone)}>{value}</dd>
    </div>
  );
}
