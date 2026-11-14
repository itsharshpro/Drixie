export interface FundScoreInput {
  retSeasonPct: number | null;
  spySeasonPct: number | null;
  outsideStartUsd: number;
  outsideNowUsd: number;
  reputation: number;
  promiseKept: boolean | null;
}

export interface FundScore {
  score: number;
  parts: { vsSpy: number; outsideGrowth: number; reputation: number; promise: number };
  vsSpy: number | null;
  outsideGrowthPct: number | null;
}

const clamp = (x: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, x));
const r1 = (x: number): number => Math.round(x * 10) / 10;

export function fundScore(i: FundScoreInput): FundScore {
  const vsSpy = i.retSeasonPct !== null && i.spySeasonPct !== null ? i.retSeasonPct - i.spySeasonPct : null;
  const vsPart = vsSpy === null ? 50 : clamp(50 + 5 * vsSpy);
  let outsideGrowthPct: number | null = null;
  let ogPart: number;
  if (i.outsideStartUsd > 0) {
    outsideGrowthPct = (i.outsideNowUsd / i.outsideStartUsd - 1) * 100;
    ogPart = clamp(50 + outsideGrowthPct / 2);
  } else {
    ogPart = i.outsideNowUsd > 0 ? 100 : 50;
  }
  const repPart = clamp(i.reputation);
  const promisePart = i.promiseKept === null ? 50 : i.promiseKept ? 100 : 0;
  const score = 0.5 * vsPart + 0.2 * ogPart + 0.2 * repPart + 0.1 * promisePart;
  return {
    score: r1(score),
    parts: { vsSpy: r1(vsPart), outsideGrowth: r1(ogPart), reputation: r1(repPart), promise: promisePart },
    vsSpy: vsSpy === null ? null : r1(vsSpy * 10) / 10,
    outsideGrowthPct: outsideGrowthPct === null ? null : r1(outsideGrowthPct),
  };
}

export function rankFunds<T extends { id: string; score: number; reputation: number }>(rows: readonly T[]): (T & { rank: number })[] {
  return [...rows]
    .sort((a, b) => b.score - a.score || b.reputation - a.reputation || (a.id < b.id ? -1 : 1))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
