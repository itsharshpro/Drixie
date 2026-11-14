"use client";

import type { QueryKey } from "@tanstack/react-query";
import { useTx } from "../chain/use-tx";
import { useTxMutation } from "../mutations/use-tx-mutation";
import { fundActions, fundsContractId } from "./actions";
import { fk } from "./queries";

const touch = (fund: string, account: string | null): QueryKey[] => [
  fk.fund(fund),
  fk.funds(),
  fk.feedAll(),
  ["drixie-funds", "fund", fund.toLowerCase(), "candles"],
  ...(account ? [fk.portfolio(account), ["listed", "balance", account] as QueryKey] : []),
];

export interface SubscribeVars {
  fund: string;
  fundName: string;
  yocto: string;

  usdLabel: string;
}

export function useSubscribe() {
  const tx = useTx();
  return useTxMutation<SubscribeVars>({
    run: async (v) => tx.send(fundsContractId(await tx.getConfig()), fundActions.subscribe(v.fund, v.yocto)),
    pending: (v) => `Placing your ${v.fundName} buy-in…`,
    success: (v) => ({ title: `Buy-in queued: ${v.usdLabel} into ${v.fundName}`, description: "It fills at the next NAV post, after the bell." }),
    invalidate: (v) => touch(v.fund, tx.accountId),
  });
}

export interface RedeemVars {
  fund: string;
  fundName: string;
  coinsRaw: string;
  coinsLabel: string;
}

export function useRedeem() {
  const tx = useTx();
  return useTxMutation<RedeemVars>({
    run: async (v) => tx.send(fundsContractId(await tx.getConfig()), fundActions.redeem(v.fund, v.coinsRaw)),
    pending: (v) => `Placing your ${v.fundName} cash-out…`,
    success: (v) => ({ title: `Cash-out queued: ${v.coinsLabel} ${v.fundName} coins`, description: "It pays out at the next NAV post." }),
    invalidate: (v) => touch(v.fund, tx.accountId),
  });
}

export interface CancelVars {
  id: string;
  fund: string;
}

export function useCancelOrder() {
  const tx = useTx();
  return useTxMutation<CancelVars>({
    run: async (v) => tx.send(fundsContractId(await tx.getConfig()), fundActions.cancelOrder(v.id)),
    pending: () => "Cancelling your order…",
    success: () => ({ title: "Order cancelled" }),
    invalidate: (v) => touch(v.fund, tx.accountId),
  });
}

export interface SwapVars {
  fund: string;
  fundName: string;
  side: "buy" | "sell";

  amountIn: string;
  minOut: string;
  label: string;
}

export function useSwap() {
  const tx = useTx();
  return useTxMutation<SwapVars>({
    run: async (v) => {
      const contract = fundsContractId(await tx.getConfig());
      return tx.send(
        contract,
        v.side === "buy" ? fundActions.swapNearForCoin(v.fund, v.amountIn, v.minOut) : fundActions.swapCoinForNear(v.fund, v.amountIn, v.minOut),
      );
    },
    pending: (v) => (v.side === "buy" ? `Buying ${v.fundName} coins…` : `Selling ${v.fundName} coins…`),
    success: (v) => ({ title: v.side === "buy" ? `Bought ${v.fundName} coins` : `Sold ${v.fundName} coins`, description: v.label }),
    invalidate: (v) => touch(v.fund, tx.accountId),
  });
}

export interface SeatBidVars {
  fund: string;
  fundName: string;
  yocto: string;
  label: string;
}

export function useBidSeat() {
  const tx = useTx();
  return useTxMutation<SeatBidVars>({
    run: async (v) => tx.send(fundsContractId(await tx.getConfig()), fundActions.bidSeat(v.fund, v.yocto)),
    pending: (v) => `Bidding on the ${v.fundName} seat…`,
    success: (v) => ({ title: `You lead the ${v.fundName} seat auction`, description: v.label }),
    invalidate: (v) => [...touch(v.fund, tx.accountId), ["drixie-funds", "nfts"]],
  });
}

export function useSettleSeat() {
  const tx = useTx();
  return useTxMutation<{ fund: string; fundName: string }>({
    run: async (v) => tx.send(fundsContractId(await tx.getConfig()), fundActions.settleSeatAuction(v.fund)),
    pending: (v) => `Settling the ${v.fundName} seat auction…`,
    success: (v) => ({ title: `${v.fundName} seat auction settled` }),
    invalidate: (v) => [...touch(v.fund, tx.accountId), ["drixie-funds", "nfts"]],
  });
}
