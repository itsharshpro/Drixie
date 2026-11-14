export interface SeasonClockConfig {
  bellSecs: number;
  quarterSecs: number;
  quarters: number;

  seasonStartMs: number;
}

export const DEFAULT_BELL_SECS = 900;
export const DEFAULT_QUARTER_SECS = 86_400;
export const DEFAULT_QUARTERS = 4;

export function bellIndexAt(c: SeasonClockConfig, nowMs: number): number {
  if (nowMs < c.seasonStartMs) return -1;
  return Math.floor((nowMs - c.seasonStartMs) / (c.bellSecs * 1000));
}

export function bellAtMs(c: SeasonClockConfig, bell: number): number {
  return c.seasonStartMs + bell * c.bellSecs * 1000;
}

export function nextBellAtMs(c: SeasonClockConfig, nowMs: number): number {
  return bellAtMs(c, bellIndexAt(c, nowMs) + 1);
}

export const bellsPerQuarter = (c: SeasonClockConfig): number => Math.max(1, Math.round(c.quarterSecs / c.bellSecs));

export function quarterAt(c: SeasonClockConfig, nowMs: number): number {
  if (nowMs < c.seasonStartMs) return 0;
  return Math.min(c.quarters + 1, Math.floor((nowMs - c.seasonStartMs) / (c.quarterSecs * 1000)) + 1);
}

export function quarterOfBell(c: SeasonClockConfig, bell: number): number {
  return Math.max(1, Math.ceil(bell / bellsPerQuarter(c)));
}

export function closesQuarter(c: SeasonClockConfig, bell: number): boolean {
  return bell > 0 && bell % bellsPerQuarter(c) === 0;
}

export function quarterEndMs(c: SeasonClockConfig, quarter: number): number {
  return c.seasonStartMs + quarter * c.quarterSecs * 1000;
}

export function seasonEndMs(c: SeasonClockConfig): number {
  return c.seasonStartMs + c.quarters * c.quarterSecs * 1000;
}

export function lastBellOfSeason(c: SeasonClockConfig): number {
  return bellsPerQuarter(c) * c.quarters;
}

export function epochClock(bellSecs = DEFAULT_BELL_SECS, quarterSecs = DEFAULT_QUARTER_SECS, quarters = DEFAULT_QUARTERS): SeasonClockConfig {
  return { bellSecs, quarterSecs, quarters, seasonStartMs: 0 };
}
