import type { WeightEntry } from "@listed/shared";
import { TRADING_COST_RATE } from "./caps";
import { TOTAL_BPS } from "./weights";

export interface NavStepInput {

  valuePrev: number;

  weights: readonly WeightEntry[];

  returns: Readonly<Record<string, number>>;

  crossPrev?: number;
  crossNow?: number;

  turnoverBps?: number;
  tradingCostRate?: number;

  brainBill?: number;

  mgmtFeeRate?: number;

  performanceFee?: number;
}

export interface NavStepResult {

  portfolioReturn: number;

  grossValue: number;
  tradingCost: number;
  brainBill: number;
  mgmtFee: number;
  performanceFee: number;

  value: number;

  missing: string[];
}

export function portfolioReturn(weights: readonly WeightEntry[], returns: Readonly<Record<string, number>>): { ret: number; missing: string[] } {
  let ret = 0;
  const missing: string[] = [];
  for (const w of weights) {
    if (w.bps <= 0) continue;
    const r = returns[w.asset];
    if (r === undefined || !Number.isFinite(r)) {
      missing.push(w.asset);
      continue;
    }
    ret += (w.bps / TOTAL_BPS) * r;
  }
  return { ret, missing };
}

export function navStep(i: NavStepInput): NavStepResult {
  const crossPrev = Math.max(0, i.crossPrev ?? 0);
  const crossNow = Math.max(0, i.crossNow ?? crossPrev);
  const base = Math.max(0, i.valuePrev - crossPrev);
  const { ret, missing } = portfolioReturn(i.weights, i.returns);
  const grossValue = base * (1 + ret) + crossNow;
  const tradingCost = ((i.turnoverBps ?? 0) / TOTAL_BPS) * grossValue * (i.tradingCostRate ?? TRADING_COST_RATE);
  const mgmtFee = grossValue * (i.mgmtFeeRate ?? 0);
  const brainBill = Math.max(0, i.brainBill ?? 0);
  const performanceFee = Math.max(0, i.performanceFee ?? 0);
  const value = Math.max(0, grossValue - tradingCost - brainBill - mgmtFee - performanceFee);
  return { portfolioReturn: ret, grossValue, tradingCost, brainBill, mgmtFee, performanceFee, value, missing };
}

export function priceReturn(prev: number | null | undefined, now: number | null | undefined): number | null {
  if (prev === null || prev === undefined || now === null || now === undefined) return null;
  if (!(prev > 0) || !(now > 0)) return null;
  return now / prev - 1;
}

export function resolveCrossValues(
  own: Readonly<Record<string, number>>,
  holdings: Readonly<Record<string, Readonly<Record<string, number>>>>,
  supply: Readonly<Record<string, number>>,
  opts: { maxIter?: number; tol?: number } = {},
): { values: Record<string, number>; iterations: number; converged: boolean } {
  const ids = Object.keys(own);
  let values: Record<string, number> = { ...own };
  const maxIter = opts.maxIter ?? 100;
  const tol = opts.tol ?? 1e-9;
  for (let it = 1; it <= maxIter; it++) {
    const next: Record<string, number> = {};
    let delta = 0;
    for (const f of ids) {
      let v = own[f] ?? 0;
      for (const [g, coins] of Object.entries(holdings[f] ?? {})) {
        const s = supply[g] ?? 0;
        if (s > 0 && g !== f) v += (coins * (values[g] ?? 0)) / s;
      }
      next[f] = v;
      delta = Math.max(delta, Math.abs(v - (values[f] ?? 0)) / Math.max(1, Math.abs(v)));
    }
    values = next;
    if (delta < tol) return { values, iterations: it, converged: true };
  }
  return { values, iterations: maxIter, converged: false };
}
