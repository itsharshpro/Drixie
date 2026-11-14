export const MAX_BOND_BPS = 3000;
export const PROMISE_KEPT_REP = 10;
export const PROMISE_MISSED_REP = -25;

export function maxPromiseBps(input: { managerStakeCoins: number; bondBps: number; userCoins: number }): number {
  if (input.bondBps < 0 || input.bondBps > MAX_BOND_BPS) return 0;
  const bondCoins = (input.managerStakeCoins * input.bondBps) / 10_000;
  if (!(input.userCoins > 0)) return 0;
  return Math.floor((bondCoins / input.userCoins) * 10_000);
}

export interface PromiseSettlement {
  kept: boolean;

  userReturn: number;
  shortfallUsd: number;

  coveredUsd: number;

  mintCoins: number;

  burnCoins: number;
  reputationDelta: number;
}

export function settlePromise(input: { targetBps: number; navStart: number; navEnd: number; userCoins: number; bondCoins: number }): PromiseSettlement {
  const { targetBps, navStart, navEnd, userCoins, bondCoins } = input;
  const userReturn = navStart > 0 ? navEnd / navStart - 1 : 0;
  const target = targetBps / 10_000;
  if (userReturn >= target || !(userCoins > 0) || !(navEnd > 0)) {
    const kept = userReturn >= target || !(userCoins > 0);
    return { kept, userReturn, shortfallUsd: 0, coveredUsd: 0, mintCoins: 0, burnCoins: 0, reputationDelta: kept ? PROMISE_KEPT_REP : PROMISE_MISSED_REP };
  }
  const shortfallUsd = (navStart * (1 + target) - navEnd) * userCoins;
  const coveredUsd = Math.min(shortfallUsd, Math.max(0, bondCoins) * navEnd);
  const coins = coveredUsd / navEnd;
  return { kept: false, userReturn, shortfallUsd, coveredUsd, mintCoins: coins, burnCoins: coins, reputationDelta: PROMISE_MISSED_REP };
}
