import type { ModelTier } from "../llm/provider.js";

export const BEST_FROM_USD = 3_000_000;
export const PRIMARY_FROM_USD = 1_000_000;

export function tierForValue(valueUsd: number): ModelTier {
  if (!(valueUsd > 0)) return "small";
  return valueUsd >= BEST_FROM_USD ? "best" : valueUsd >= PRIMARY_FROM_USD ? "primary" : "small";
}

export function tierLabel(t: ModelTier): "Small" | "Primary" | "Best" {
  return t === "best" ? "Best" : t === "primary" ? "Primary" : "Small";
}

export function billUsd(aiCostUsd: number, multiplier: number): number {
  if (!(aiCostUsd > 0) || !(multiplier > 0)) return 0;
  return Number((aiCostUsd * multiplier).toFixed(6));
}

export const DECISION_TOKENS = {
  normal: { prompt: 6000, completion: 700 },
  deep: { prompt: 9000, completion: 2200 },
} as const;

export function estimateNextBill(o: {
  recentBills: readonly number[];
  think: "normal" | "deep";
  price: { in: number; out: number };
  multiplier: number;
}): number {
  const recent = o.recentBills.filter((b) => b > 0).slice(-8);
  if (recent.length >= 2) return Math.max(...recent) * (o.think === "deep" ? 2 : 1);
  const tok = DECISION_TOKENS[o.think];
  const cost = (tok.prompt * o.price.in + tok.completion * o.price.out) / 1_000_000;
  return billUsd(cost, o.multiplier);
}

export interface AutopilotVerdict {
  autopilot: boolean;
  cashUsd: number;
  needUsd: number;
  reason: string | null;
}

export function autopilotCheck(o: { valueUsd: number; cashBps: number; nextBillUsd: number; firstAllocation: boolean }): AutopilotVerdict {
  const cashUsd = (o.valueUsd * Math.max(0, o.cashBps)) / 10_000;

  const usable = o.firstAllocation ? o.valueUsd : cashUsd;
  if (usable >= o.nextBillUsd) return { autopilot: false, cashUsd: usable, needUsd: o.nextBillUsd, reason: null };
  return {
    autopilot: true,
    cashUsd: usable,
    needUsd: o.nextBillUsd,
    reason: `cash buffer $${usable.toFixed(2)} cannot pay the next brain bill (about $${o.nextBillUsd.toFixed(2)})`,
  };
}

export function cashFloorBps(o: { valueUsd: number; nextBillUsd: number; bells?: number; minBps?: number }): number {
  const bells = o.bells ?? 8;
  const min = o.minBps ?? 20;
  if (!(o.valueUsd > 0)) return min;
  const need = Math.ceil(((o.nextBillUsd * bells) / o.valueUsd) * 10_000);
  return Math.min(2000, Math.max(min, need));
}
