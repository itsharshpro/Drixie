import type { WeightEntry } from "@listed/shared";
import { sha256Hex } from "./sha256";

export const TOTAL_BPS = 10_000;

const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function normalizeWeights(weights: readonly WeightEntry[]): WeightEntry[] {
  const m = new Map<string, number>();
  for (const w of weights) m.set(w.asset, (m.get(w.asset) ?? 0) + Math.trunc(w.bps));
  return [...m.entries()]
    .filter(([, bps]) => bps !== 0)
    .map(([asset, bps]) => ({ asset, bps }))
    .sort((a, b) => byteOrder(a.asset, b.asset));
}

export function weightsFromRecord(rec: Record<string, number>): WeightEntry[] {
  return normalizeWeights(Object.entries(rec).map(([asset, bps]) => ({ asset, bps: Number(bps) })));
}

export function weightsToRecord(weights: readonly WeightEntry[]): Record<string, number> {
  return Object.fromEntries(normalizeWeights(weights).map((w) => [w.asset, w.bps]));
}

export function canonicalWeights(weights: readonly WeightEntry[], cashBps: number): string {
  const body = normalizeWeights(weights)
    .filter((w) => w.bps > 0)
    .map((w) => `${w.asset}:${w.bps}`)
    .join(",");
  return `${body}|cash:${Math.trunc(cashBps)}`;
}

export function commitPreimage(fund: string, bell: number | bigint, weights: readonly WeightEntry[], cashBps: number, salt: string): string {
  return `${fund}|${bell.toString()}|${canonicalWeights(weights, cashBps)}|${salt}`;
}

export function commitHash(fund: string, bell: number | bigint, weights: readonly WeightEntry[], cashBps: number, salt: string): string {
  return sha256Hex(commitPreimage(fund, bell, weights, cashBps, salt));
}

export function randomSalt(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(rand() * 16).toString(16);
  return s;
}

export function turnoverBps(prev: readonly WeightEntry[], prevCashBps: number, next: readonly WeightEntry[], nextCashBps: number): number {
  const a = new Map(normalizeWeights(prev).map((w) => [w.asset, w.bps]));
  const b = new Map(normalizeWeights(next).map((w) => [w.asset, w.bps]));
  let sum = Math.abs(nextCashBps - prevCashBps);
  for (const k of new Set([...a.keys(), ...b.keys()])) sum += Math.abs((b.get(k) ?? 0) - (a.get(k) ?? 0));
  return sum / 2;
}

export interface WeightDiffRow {
  asset: string;
  before: number;
  after: number;
  delta: number;
  kind: "enter" | "exit" | "up" | "down" | "same";
}

export function diffWeights(prev: readonly WeightEntry[], next: readonly WeightEntry[]): WeightDiffRow[] {
  const a = new Map(normalizeWeights(prev).map((w) => [w.asset, w.bps]));
  const b = new Map(normalizeWeights(next).map((w) => [w.asset, w.bps]));
  const rows: WeightDiffRow[] = [];
  for (const asset of new Set([...a.keys(), ...b.keys()])) {
    const before = a.get(asset) ?? 0;
    const after = b.get(asset) ?? 0;
    const delta = after - before;
    const kind = before === 0 && after > 0 ? "enter" : after === 0 && before > 0 ? "exit" : delta > 0 ? "up" : delta < 0 ? "down" : "same";
    rows.push({ asset, before, after, delta, kind });
  }
  return rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || byteOrder(x.asset, y.asset));
}
