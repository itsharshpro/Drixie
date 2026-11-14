import type { PoolInfo, PublicConfig } from "@listed/shared";
import type { FunctionCallSpec } from "../chain/actions";

const TGAS = BigInt(1_000_000_000_000);
const G = (n: number) => (BigInt(n) * TGAS).toString();

export const FUND_GAS = { order: G(60), swap: G(80), seat: G(60), settle: G(150) } as const;

export function fundsContractId(config: PublicConfig): string {
  const c = config as PublicConfig & { fundsContract?: string | null };
  if (c.fundsContract) return c.fundsContract;
  const env = process.env.NEXT_PUBLIC_FUNDS_CONTRACT;
  if (env) return env;
  const parent = config.root.split(".").slice(1).join(".");
  return parent ? `drixie.${parent}` : `drixie.${config.root}`;
}

export const MIN_SUBSCRIBE_NEAR = 0.05;

export function configUsdPerNear(config: PublicConfig | undefined | null): number | null {
  const v = (config as (PublicConfig & { gameUsdPerNear?: number }) | null | undefined)?.gameUsdPerNear;
  return typeof v === "number" && v > 0 ? v : null;
}

export const fundActions = {
  subscribe: (fund: string, yocto: string): FunctionCallSpec[] => [
    { methodName: "subscribe", args: { fund }, gas: FUND_GAS.order, deposit: yocto },
  ],
  redeem: (fund: string, coinsRaw: string): FunctionCallSpec[] => [
    { methodName: "redeem", args: { fund, coins: coinsRaw }, gas: FUND_GAS.order, deposit: "0" },
  ],
  cancelOrder: (id: string): FunctionCallSpec[] => [
    { methodName: "cancel_order", args: { id: String(id) }, gas: FUND_GAS.order, deposit: "0" },
  ],
  swapNearForCoin: (fund: string, yocto: string, minOutRaw: string): FunctionCallSpec[] => [
    { methodName: "swap_near_for_coin", args: { fund, min_out: minOutRaw }, gas: FUND_GAS.swap, deposit: yocto },
  ],
  swapCoinForNear: (fund: string, coinsRaw: string, minOutYocto: string): FunctionCallSpec[] => [
    { methodName: "swap_coin_for_near", args: { fund, coins: coinsRaw, min_out: minOutYocto }, gas: FUND_GAS.swap, deposit: "0" },
  ],
  bidSeat: (fund: string, yocto: string): FunctionCallSpec[] => [
    { methodName: "bid_seat", args: { fund }, gas: FUND_GAS.seat, deposit: yocto },
  ],
  settleSeatAuction: (fund: string): FunctionCallSpec[] => [
    { methodName: "settle_seat_auction", args: { fund }, gas: FUND_GAS.settle, deposit: "0" },
  ],
};

export function quoteSwap(pool: PoolInfo | null | undefined, side: "buy" | "sell", amountIn: string): string {
  if (!pool) return "0";
  const x = BigInt(pool.nearReserve || "0");
  const y = BigInt(pool.coinReserve || "0");
  const a = BigInt(amountIn || "0");
  if (x <= BigInt(0) || y <= BigInt(0) || a <= BigInt(0)) return "0";
  const fee = BigInt(10_000 - (pool.feeBps ?? 30));
  const aFee = a * fee;
  const [rin, rout] = side === "buy" ? [x, y] : [y, x];
  const out = (rout * aFee) / (rin * BigInt(10_000) + aFee);
  return out.toString();
}

export function priceImpact(pool: PoolInfo | null | undefined, side: "buy" | "sell", amountIn: string, out: string): number | null {
  if (!pool) return null;
  const x = Number(BigInt(pool.nearReserve || "0")) / 1e24;
  const y = Number(BigInt(pool.coinReserve || "0")) / 1e18;
  const a = Number(BigInt(amountIn || "0")) / (side === "buy" ? 1e24 : 1e18);
  const o = Number(BigInt(out || "0")) / (side === "buy" ? 1e18 : 1e24);
  if (!x || !y || !a || !o) return null;
  const spot = x / y; // NEAR per coin
  const avg = side === "buy" ? a / o : o / a;
  return Math.abs(avg / spot - 1) * 100;
}
