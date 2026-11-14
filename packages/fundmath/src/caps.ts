import type { FundRiskCaps, WeightEntry } from "@listed/shared";
import { assetById, INDIA_CAP_BPS, isCrypto } from "./universe";
import { normalizeWeights, TOTAL_BPS } from "./weights";

export const HOLDINGS_COUNT = 10;
export const MIN_HOLDING_BPS = 200;
export const MAX_HOLDING_BPS = 2500;
export const CASH_MAX_BPS = 2000;
export const MAX_STEP_BPS = 1000;
export const MAX_SWAPS_PER_BELL = 2;
export const REVEAL_WINDOW_SECS = 180;
export const TRADING_COST_RATE = 0.001;
export const CROSS_MAX_TARGET_SUPPLY_BPS = 1000;
export const CROSS_MAX_OWN_VALUE_BPS = 2000;
export const CROSS_MIN_REPUTATION = 40;

export interface FundCapsInput {
  startupCapBps: number;
  basketCapBps: number;

  cryptoCapBps?: number;
}

export function capsFor(f: FundCapsInput & { turnoverAllowancePct: number }): FundRiskCaps {
  return {
    startupCapBps: f.startupCapBps,
    basketCapBps: f.basketCapBps,
    cryptoCapBps: f.cryptoCapBps ?? 0,
    indiaCapBps: INDIA_CAP_BPS,
    cashMaxBps: CASH_MAX_BPS,
    minHoldingBps: MIN_HOLDING_BPS,
    maxHoldingBps: MAX_HOLDING_BPS,
    maxStepBps: MAX_STEP_BPS,
    maxSwapsPerBell: MAX_SWAPS_PER_BELL,
    turnoverAllowancePct: f.turnoverAllowancePct,
  };
}

export type CapViolationCode =
  | "holdings_count"
  | "unknown_asset"
  | "holding_range"
  | "cash_range"
  | "sum"
  | "basket_cap"
  | "startup_cap"
  | "india_cap"
  | "crypto_cap"
  | "step"
  | "swaps";

export interface CapViolation {
  code: CapViolationCode;
  message: string;
  asset?: string;
}

export function validateWeights(
  next: readonly WeightEntry[],
  cashBps: number,
  caps: FundCapsInput,
  prev?: { weights: readonly WeightEntry[]; cashBps: number } | null,
): CapViolation[] {
  const out: CapViolation[] = [];
  const w = normalizeWeights(next);
  if (w.some((x) => x.bps < 0)) out.push({ code: "holding_range", message: "Weights cannot be negative." });
  const held = w.filter((x) => x.bps > 0);
  if (held.length !== HOLDINGS_COUNT) out.push({ code: "holdings_count", message: `A fund holds exactly ${HOLDINGS_COUNT} assets (got ${held.length}).` });
  for (const x of held) {
    if (!assetById(x.asset)) out.push({ code: "unknown_asset", asset: x.asset, message: `${x.asset} is not in the universe.` });
    if (x.bps < MIN_HOLDING_BPS || x.bps > MAX_HOLDING_BPS) {
      out.push({ code: "holding_range", asset: x.asset, message: `${x.asset} must be ${MIN_HOLDING_BPS}-${MAX_HOLDING_BPS} bps (got ${x.bps}).` });
    }
  }
  if (!Number.isInteger(cashBps) || cashBps < 0 || cashBps > CASH_MAX_BPS) out.push({ code: "cash_range", message: `Cash must be 0-${CASH_MAX_BPS} bps (got ${cashBps}).` });
  const sum = held.reduce((s, x) => s + x.bps, 0) + cashBps;
  if (sum !== TOTAL_BPS) out.push({ code: "sum", message: `Weights plus cash must sum to ${TOTAL_BPS} bps (got ${sum}).` });

  const baskets = new Map<string, number>();
  let startups = 0;
  let india = 0;
  let crypto = 0;
  for (const x of held) {
    const a = assetById(x.asset);
    if (!a) continue;
    baskets.set(a.basket, (baskets.get(a.basket) ?? 0) + x.bps);
    if (a.basket === "startups" || a.kind === "startup") startups += x.bps;
    if (a.region === "india") india += x.bps;
    if (isCrypto(x.asset)) crypto += x.bps;
  }
  for (const [basket, bps] of baskets) {
    if (bps > caps.basketCapBps) out.push({ code: "basket_cap", message: `Basket ${basket} is ${bps} bps, over the fund's ${caps.basketCapBps} bps cap.` });
  }
  if (startups > caps.startupCapBps) out.push({ code: "startup_cap", message: `Startups are ${startups} bps, over the fund's ${caps.startupCapBps} bps cap.` });
  const cryptoCap = caps.cryptoCapBps ?? 0;
  if (crypto > cryptoCap) out.push({ code: "crypto_cap", message: `Crypto is ${crypto} bps, over the fund's ${cryptoCap} bps cap.` });
  if (india > INDIA_CAP_BPS) out.push({ code: "india_cap", message: `India is ${india} bps, over the ${INDIA_CAP_BPS} bps cap.` });

  if (prev && prev.weights.length > 0) {
    const before = new Map(normalizeWeights(prev.weights).map((x) => [x.asset, x.bps]));
    const after = new Map(held.map((x) => [x.asset, x.bps]));
    for (const asset of new Set([...before.keys(), ...after.keys()])) {
      const d = Math.abs((after.get(asset) ?? 0) - (before.get(asset) ?? 0));
      if (d > MAX_STEP_BPS) out.push({ code: "step", asset, message: `${asset} moves ${d} bps; at most ${MAX_STEP_BPS} bps per bell.` });
    }
    const entered = [...after.keys()].filter((a) => !before.has(a) || (before.get(a) ?? 0) === 0).length;
    if (entered > MAX_SWAPS_PER_BELL) out.push({ code: "swaps", message: `${entered} holdings swapped; at most ${MAX_SWAPS_PER_BELL} per bell.` });
  }
  return out;
}

export function crossTradeBlock(input: {
  targetReputation: number;

  targetSupplyShareBps: number;

  ownValueShareBps: number;
}): string | null {
  if (input.targetReputation < CROSS_MIN_REPUTATION) return `The target's reputation is below ${CROSS_MIN_REPUTATION}.`;
  if (input.targetSupplyShareBps > CROSS_MAX_TARGET_SUPPLY_BPS) return "At most 10% of the target's coins.";
  if (input.ownValueShareBps > CROSS_MAX_OWN_VALUE_BPS) return "Cross holdings are capped at 20% of the fund's value.";
  return null;
}
