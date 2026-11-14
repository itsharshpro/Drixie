import { FUND_COIN_DECIMALS, MICRO_USD } from "@listed/shared";

export const COIN_ONE = 10n ** BigInt(FUND_COIN_DECIMALS);
export const YOCTO_ONE = 10n ** 24n;

export function usdToMicro(usd: number): bigint {
  if (!Number.isFinite(usd)) throw new Error(`not a finite USD amount: ${usd}`);
  return BigInt(Math.round(usd * MICRO_USD));
}

export function microToUsd(micro: bigint | string | number): number {
  return Number(BigInt(micro)) / MICRO_USD;
}

export function coinsToNum(raw: bigint | string): number {
  const v = BigInt(raw);
  return Number(v / COIN_ONE) + Number(v % COIN_ONE) / Number(COIN_ONE);
}

export function numToCoins(coins: number): bigint {
  const whole = Math.trunc(coins);
  const frac = coins - whole;
  return BigInt(whole) * COIN_ONE + BigInt(Math.round(frac * 1e9)) * 10n ** BigInt(FUND_COIN_DECIMALS - 9);
}

export function navMicro(valueMicro: bigint, supplyRaw: bigint): bigint | null {
  if (supplyRaw <= 0n) return null;
  return (valueMicro * COIN_ONE) / supplyRaw;
}

export function yoctoToUsd(yocto: bigint | string, gameUsdPerNear: number): number {
  const v = BigInt(yocto);
  const near = Number(v / YOCTO_ONE) + Number(v % YOCTO_ONE) / 1e24;
  return near * gameUsdPerNear;
}
