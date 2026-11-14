export function parseShown(s: string): number {
  const cleaned = s.replace(/−/g, "-").replace(/[^0-9.-]/g, "");
  return cleaned ? Number.parseFloat(cleaned) : Number.NaN;
}

export function reelSteps(from: number, to: number, dir: 1 | -1, turns = 0): number {
  const d = dir === 1 ? (to - from + 10) % 10 : (from - to + 10) % 10;
  return dir * (d + (d === 0 && turns === 0 ? 0 : turns * 10));
}
