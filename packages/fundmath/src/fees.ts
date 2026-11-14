export const MGMT_FEE_PER_YEAR = 0.02;

export const YEAR_SECS = 31_536_000;
export const PERFORMANCE_FEE_RATE = 0.15;
export const FEE_SPLIT_BPS = { buyback: 5000, seat: 3000, protocol: 2000 } as const;
export const COMPUTE_MULTIPLIER_DEFAULT = 20_000;
export const EXIT_LOAD_RATE = 0.01;
export const EXIT_LOAD_WAIVED_BELOW_REPUTATION = 25;

export function mgmtFeeFor(elapsedSecs: number): number {
  if (!(elapsedSecs > 0)) return 0;
  return (MGMT_FEE_PER_YEAR * elapsedSecs) / YEAR_SECS;
}

export function mgmtFeePerBell(bellSecs: number, _quarterSecs?: number): number {
  return mgmtFeeFor(bellSecs);
}

export function mgmtFeeMicro(valueMicro: bigint, elapsedSecs: number): bigint {
  if (!(elapsedSecs > 0)) return 0n;
  return (valueMicro * 200n * BigInt(Math.floor(elapsedSecs))) / (10_000n * BigInt(YEAR_SECS));
}

export function performanceFee(input: { navStart: number; navEnd: number; spyReturn: number | null; valueStart: number }): number {
  if (!(input.navStart > 0) || input.spyReturn === null || !Number.isFinite(input.spyReturn)) return 0;
  const excess = input.navEnd / input.navStart - 1 - input.spyReturn;
  return excess > 0 ? PERFORMANCE_FEE_RATE * excess * Math.max(0, input.valueStart) : 0;
}

export function splitFee(feeUsd: number, outsideShare: number): { onUsers: number; buyback: number; seat: number; protocol: number } {
  const onUsers = Math.max(0, feeUsd) * Math.min(1, Math.max(0, outsideShare));
  return {
    onUsers,
    buyback: (onUsers * FEE_SPLIT_BPS.buyback) / 10_000,
    seat: (onUsers * FEE_SPLIT_BPS.seat) / 10_000,
    protocol: (onUsers * FEE_SPLIT_BPS.protocol) / 10_000,
  };
}

export function exitLoad(input: { heldSecs: number; quarterSecs: number; reputation: number }): number {
  if (input.reputation < EXIT_LOAD_WAIVED_BELOW_REPUTATION) return 0;
  return input.heldSecs < input.quarterSecs ? EXIT_LOAD_RATE : 0;
}

export type BrainTierId = "best" | "primary" | "small";

export function brainTier(valueUsd: number): BrainTierId {
  if (valueUsd >= 3_000_000) return "best";
  if (valueUsd >= 1_000_000) return "primary";
  return "small";
}

export function brainBill(aiCostUsd: number, multiplier = COMPUTE_MULTIPLIER_DEFAULT, crunch = false): number {
  const base = Math.max(0, aiCostUsd) * Math.max(0, multiplier);
  return crunch ? base * 2 : base;
}
