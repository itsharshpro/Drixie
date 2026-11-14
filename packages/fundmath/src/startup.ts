export const STARTUP_INDEX_BASE = 100;
export const STARTUP_BPS_PER_SENTIMENT = 150;
export const STARTUP_DAILY_CAP_BPS = 1000;
export const STARTUP_WINTER_BPS = -800;

export function startupNewsMoveBps(sentiments: readonly number[]): number {
  const sum = sentiments.reduce((s, x) => s + (Number.isFinite(x) ? Math.max(-2, Math.min(2, Math.round(x))) : 0), 0);
  return Math.max(-STARTUP_DAILY_CAP_BPS, Math.min(STARTUP_DAILY_CAP_BPS, sum * STARTUP_BPS_PER_SENTIMENT));
}

export function startupMark(prevMark: number, newsBps: number, eventBps = 0): number {
  const m = prevMark * (1 + newsBps / 10_000) * (1 + eventBps / 10_000);
  return Math.round(Math.max(0.0001, m) * 10_000) / 10_000;
}

export function roundResetMark(baseValuationUsd: number, newValuationUsd: number): number {
  if (!(baseValuationUsd > 0) || !(newValuationUsd > 0)) return STARTUP_INDEX_BASE;
  return Math.round(STARTUP_INDEX_BASE * (newValuationUsd / baseValuationUsd) * 10_000) / 10_000;
}

export function impliedValuation(baseValuationUsd: number, mark: number): number {
  return (baseValuationUsd * mark) / STARTUP_INDEX_BASE;
}
