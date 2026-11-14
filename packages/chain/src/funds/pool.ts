const ZERO = BigInt(0);
const BPS = BigInt(10000);
export const POOL_FEE_BPS = 30;
export const COIN_DECIMALS = 18;
const COIN_UNIT = BigInt("1000000000000000000");
const YOCTO_PER_NEAR = BigInt("1000000000000000000000000");
const big = (v: bigint | string | number): bigint => (typeof v === "bigint" ? v : BigInt(v));

export interface PoolReserves {

  near: string;

  coins: string;
  fee_bps?: number;
  fund?: string;
  price_micro_usd?: string;
  nav_micro_usd?: string;
  premium_bps?: number;
}

export interface SwapQuote {
  out: bigint;
  fee: bigint;

  priceAfterYocto: bigint;

  impactBps: number;
}

export function poolPriceYocto(pool: PoolReserves): bigint {
  const n = big(pool.near);
  const c = big(pool.coins);
  return c === ZERO ? ZERO : (n * COIN_UNIT) / c;
}

export function poolPriceUsd(pool: PoolReserves, gameUsdPerNear: number): number | null {
  const p = poolPriceYocto(pool);
  if (p === ZERO) return null;
  return (Number(p / BigInt("1000000")) / 1e18) * gameUsdPerNear;
}

function impact(before: bigint, after: bigint): number {
  if (before === ZERO) return 0;
  return Number(((after - before) * BPS) / before);
}

export function quoteBuyCoin(pool: PoolReserves, nearIn: bigint | string): SwapQuote {
  const x = big(pool.near);
  const y = big(pool.coins);
  const dx = big(nearIn);
  const feeBps = BigInt(pool.fee_bps ?? POOL_FEE_BPS);
  const fee = (dx * feeBps) / BPS;
  const dxNet = dx - fee;
  const out = x + dxNet === ZERO ? ZERO : (y * dxNet) / (x + dxNet);
  const after = { near: (x + dx).toString(), coins: (y - out).toString() };
  return { out, fee, priceAfterYocto: poolPriceYocto(after), impactBps: impact(poolPriceYocto(pool), poolPriceYocto(after)) };
}

export function quoteSellCoin(pool: PoolReserves, coinsIn: bigint | string): SwapQuote {
  const x = big(pool.near);
  const y = big(pool.coins);
  const dy = big(coinsIn);
  const feeBps = BigInt(pool.fee_bps ?? POOL_FEE_BPS);
  const fee = (dy * feeBps) / BPS;
  const dyNet = dy - fee;
  const out = y + dyNet === ZERO ? ZERO : (x * dyNet) / (y + dyNet);
  const after = { near: (x - out).toString(), coins: (y + dy).toString() };
  return { out, fee, priceAfterYocto: poolPriceYocto(after), impactBps: impact(poolPriceYocto(pool), poolPriceYocto(after)) };
}

export function withSlippageBps(amount: bigint | string, bps: number): bigint {
  return (big(amount) * BigInt(10000 - bps)) / BPS;
}

export function yoctoToUsd(yocto: bigint | string, gameUsdPerNear: number): number {
  return (Number(big(yocto) / BigInt("1000000000000")) / 1e12) * gameUsdPerNear;
}

export function usdToYocto(usd: number, gameUsdPerNear: number): bigint {
  const microNear = Math.floor((usd / gameUsdPerNear) * 1e6);
  return (BigInt(microNear) * YOCTO_PER_NEAR) / BigInt("1000000");
}

export const coinsToNumber = (raw: bigint | string): number => Number(big(raw) / BigInt("1000000000000")) / 1e6;

export const coinsFromNumber = (n: number): bigint => (BigInt(Math.floor(n * 1e6)) * COIN_UNIT) / BigInt("1000000");

