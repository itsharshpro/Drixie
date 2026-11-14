import { mgmtFeePerBell, navMicro, navStep, usdToMicro, yoctoToUsd, type NavStepResult } from "@listed/fundmath";
import type { WeightEntry } from "@listed/shared";
import type { ChainFund, NavPostRow } from "./chain";

export interface FundSnapshot {
  bell: number;
  value: bigint;
  vault: bigint;
  crossValue: bigint;
  turnoverQuarterBps: number;
  weights: WeightEntry[];
  cashBps: number;
}

export interface EngineInput {
  bell: number;
  funds: ChainFund[];

  snapshots: ReadonlyMap<string, FundSnapshot>;
  returns: Readonly<Record<string, number>>;

  brainBills: Readonly<Record<string, number>>;
  gameUsdPerNear: number;
  bellSecs: number;
  quarterSecs: number;

  bellsElapsed: number;
}

export interface FundResult {
  fund: string;
  valuePrev: number;
  crossPrev: number;
  crossNow: number;
  crossFlow: number;
  turnoverBps: number;
  step: NavStepResult;
  valueMicro: bigint;
  navMicro: bigint;

  skipped: string | null;
}

const micro = (v: bigint): number => Number(v) / 1e6;

export function inferCrossFlow(f: ChainFund, s: FundSnapshot | undefined, gameUsdPerNear: number): number {
  if (!s) return 0;
  const dVault = yoctoToUsd(f.vault - s.vault, gameUsdPerNear);
  const dValue = micro(f.value - s.value);
  const flow = -(dVault - dValue);
  const dCross = micro(f.crossValue - s.crossValue);
  if (Math.abs(flow) < 0.01) return 0;
  if (Math.sign(flow) !== Math.sign(dCross)) return 0;
  if (Math.abs(flow) > Math.abs(dCross) * 2 + 1) return 0;
  return flow;
}

export function bellTurnover(f: ChainFund, s: FundSnapshot | undefined): number {
  if (!s) return 0;
  const d = f.turnoverQuarterBps - s.turnoverQuarterBps;
  return d >= 0 ? d : f.turnoverQuarterBps;
}

export function computeNavs(i: EngineInput): { rows: NavPostRow[]; results: FundResult[] } {
  const feeRate = mgmtFeePerBell(i.bellSecs, i.quarterSecs) * Math.max(1, i.bellsElapsed);
  const results: FundResult[] = [];
  for (const f of i.funds) {
    const s = i.snapshots.get(f.id);
    const valuePrev = micro(f.value);
    const crossNow = micro(f.crossValue);
    const crossPrev = s ? micro(s.crossValue) : crossNow;
    const crossFlow = inferCrossFlow(f, s, i.gameUsdPerNear);

    const weights = s ? s.weights : f.weights;
    const turnoverBps = bellTurnover(f, s);
    const step = navStep({
      valuePrev: valuePrev - crossFlow,
      weights,
      returns: i.returns,
      crossPrev: crossPrev,
      crossNow: crossNow,
      turnoverBps,
      brainBill: i.brainBills[f.id] ?? 0,
      mgmtFeeRate: feeRate,
    });

    const value = step.value;
    let skipped: string | null = null;
    if (!f.active) skipped = `status ${f.status}`;
    else if (f.supply <= 0n) skipped = "no coins";
    else if (!(value > 0)) skipped = "value would be zero";
    else if (f.value > 0n && Math.abs(value - valuePrev) > valuePrev * 0.5) skipped = "value moves more than 50% (contract guard); check prices";
    const valueMicro = usdToMicro(value);
    const nm = navMicro(valueMicro, f.supply) ?? 0n;
    if (!skipped && nm <= 0n) skipped = "nav would be zero";
    results.push({ fund: f.id, valuePrev, crossPrev, crossNow, crossFlow, turnoverBps, step, valueMicro, navMicro: nm, skipped });
  }
  const rows = results.filter((r) => !r.skipped).map((r) => ({ fund: r.fund, nav_micro_usd: r.navMicro.toString(), value_micro_usd: r.valueMicro.toString() }));
  return { rows, results };
}

export function snapshotOf(f: ChainFund, bell: number): FundSnapshot {
  return { bell, value: f.value, vault: f.vault, crossValue: f.crossValue, turnoverQuarterBps: f.turnoverQuarterBps, weights: f.weights, cashBps: f.cashBps };
}
