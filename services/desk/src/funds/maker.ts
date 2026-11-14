export const MAKER_RULE =
  "Keeps coin pools trading: every 45-120 s, for each fund, one small pool swap (0.02-0.08 NEAR) towards NAV when the coin is 0.5% or more away from it, otherwise a random buy or sell. Skips thin pools; capped per hour.";
export const MAKER_BAND = 0.005;
export const MAKER_MIN_NEAR = 0.02;
export const MAKER_MAX_NEAR = 0.08;
export const MAKER_MIN_DELAY_MS = 45_000;
export const MAKER_MAX_DELAY_MS = 120_000;

export const MAKER_MAX_POOL_SHARE = 0.01;

export const MAKER_MIN_GAP_MS = 3_000;

const YOCTO = 10n ** 24n;

export interface MakerInput {
  fund: string;
  status: string;

  nav: number;

  pool: { near: bigint; coins: bigint } | null;

  usdPerNear: number;

  heldCoins: bigint;

  spendable: bigint;

  size: bigint;

  sinceLastSwapMs: number | null;

  rnd: number;
}

export type MakerDecision =
  | { kind: "buy_coin"; fund: string; near: bigint; why: string }
  | { kind: "sell_coin"; fund: string; coins: bigint; why: string }
  | { kind: "skip"; fund: string; why: string };

export function makerSize(rnd: number): bigint {
  const near = MAKER_MIN_NEAR + Math.max(0, Math.min(1, rnd)) * (MAKER_MAX_NEAR - MAKER_MIN_NEAR);
  return (BigInt(Math.round(near * 1e6)) * YOCTO) / 1_000_000n;
}

export const makerDelayMs = (rnd: number): number => Math.round(MAKER_MIN_DELAY_MS + Math.max(0, Math.min(1, rnd)) * (MAKER_MAX_DELAY_MS - MAKER_MIN_DELAY_MS));

export function makerDecide(i: MakerInput): MakerDecision {
  const skip = (why: string): MakerDecision => ({ kind: "skip", fund: i.fund, why });
  if (i.status === "liquidated" || !(i.nav > 0)) return skip("fund not trading");
  if (!i.pool || i.pool.near <= 0n || i.pool.coins <= 0n) return skip("no pool");
  if (i.sinceLastSwapMs !== null && i.sinceLastSwapMs < MAKER_MIN_GAP_MS) return skip("swapped this block");
  if (i.size <= 0n) return skip("no size");
  const maxIn = (i.pool.near * BigInt(Math.round(MAKER_MAX_POOL_SHARE * 1e6))) / 1_000_000n;
  if (i.size > maxIn) return skip("pool too thin for the size");

  const priceUsd = (Number((i.pool.near * 10n ** 18n * 1_000_000n) / i.pool.coins / YOCTO) / 1e6) * i.usdPerNear;
  const gap = priceUsd / i.nav - 1;
  const coinsForSize = (i.size * i.pool.coins) / i.pool.near;
  const buy = (why: string): MakerDecision =>
    i.spendable >= i.size ? { kind: "buy_coin", fund: i.fund, near: i.size, why } : skip("NEAR balance guard");
  const sell = (why: string): MakerDecision =>
    i.heldCoins >= coinsForSize && coinsForSize > 0n ? { kind: "sell_coin", fund: i.fund, coins: coinsForSize, why } : skip("no coins to sell");
  const pct = `${gap >= 0 ? "+" : ""}${(gap * 100).toFixed(2)}%`;
  if (gap <= -MAKER_BAND) return buy(`coin ${pct} vs NAV: small buy towards NAV`);
  if (gap >= MAKER_BAND) return sell(`coin ${pct} vs NAV: small sell towards NAV`);

  const first = i.rnd < 0.5 ? buy(`coin ${pct} vs NAV: random buy`) : sell(`coin ${pct} vs NAV: random sell`);
  if (first.kind !== "skip") return first;
  return i.rnd < 0.5 ? sell(`coin ${pct} vs NAV: random sell`) : buy(`coin ${pct} vs NAV: random buy`);
}
