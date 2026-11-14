import { coinsToNum } from "./money";

export const POOL_FEE_BPS = 30;

export function poolPriceUsd(nearReserveYocto: bigint | string, coinReserveRaw: bigint | string, gameUsdPerNear: number): number | null {
  const near = Number(BigInt(nearReserveYocto)) / 1e24;
  const coins = coinsToNum(coinReserveRaw);
  if (!(near > 0) || !(coins > 0)) return null;
  return (near * gameUsdPerNear) / coins;
}

export function premiumPct(coinPrice: number | null, nav: number | null): number | null {
  if (coinPrice === null || nav === null || !(nav > 0) || !(coinPrice > 0)) return null;
  return (coinPrice / nav - 1) * 100;
}

export function swapOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = POOL_FEE_BPS): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inWithFee = amountIn * BigInt(10_000 - feeBps);
  return (inWithFee * reserveOut) / (reserveIn * 10_000n + inWithFee);
}
