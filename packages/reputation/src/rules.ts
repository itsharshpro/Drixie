import { REPUTATION_START, type ReputationBadge } from "@listed/shared";

export const REP = {
  start: REPUTATION_START, // 60
  min: 0,
  max: 100,

  dailyGainCap: 2,

  redLine: 40,

  exitLoadWaiver: 25,

  turnover: {

    stepPp: 5,
    delta: -1,
  },
  flipFlop: {

    moveBps: 800,

    withinBells: 4,

    outsideMinBps: 1000,
    delta: -3,
  },
  pumpDump: {

    minBuyShareOfValue: 0.02,

    minSoldShare: 0.8,
    delta: -15,
  },
  brokenDeal: -20,
  missedPromise: -25,
  frontRunning: {

    raiseBps: 500,

    perQuarter: 3,
    delta: -5,
  },
  lowChurn: {

    shareOfAllowance: 0.5,
    delta: 0.5,
  },
  beatSpy: 3,
  honouredDeal: 2,
  keptPromise: 10,
} as const;

export function badgeFor(score: number): ReputationBadge {
  const s = clampScore(score);
  return { score: s, tone: s < REP.redLine ? "red" : s < REP.start ? "amber" : "green" };
}

export function canBeBoughtByFunds(score: number): boolean {
  return score >= REP.redLine;
}

export function exitLoadWaived(score: number): boolean {
  return score < REP.exitLoadWaiver;
}

export function roundScore(x: number): number {
  return Math.round(x * 10) / 10;
}

export function clampScore(x: number): number {
  return roundScore(Math.min(REP.max, Math.max(REP.min, x)));
}
