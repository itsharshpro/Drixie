import { usdToMicro } from "./money";
import { priceReturn } from "./nav";
import { sha256Hex } from "./sha256";

const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function canonicalPriceSet(bell: number | bigint, pricesUsd: Readonly<Record<string, number>>): string {
  const lines = Object.entries(pricesUsd)
    .filter(([, p]) => Number.isFinite(p) && p > 0)
    .sort(([a], [b]) => byteOrder(a, b))
    .map(([id, p]) => `${id}=${usdToMicro(p).toString()}`);
  return [`bell:${bell.toString()}`, ...lines].join("\n");
}

export function pricesHash(bell: number | bigint, pricesUsd: Readonly<Record<string, number>>): string {
  return sha256Hex(canonicalPriceSet(bell, pricesUsd));
}

export function roundPrices(pricesUsd: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, p] of Object.entries(pricesUsd)) if (Number.isFinite(p) && p > 0) out[id] = Number(usdToMicro(p)) / 1e6;
  return out;
}

export function returnsBetween(prev: Readonly<Record<string, number>>, now: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, p] of Object.entries(now)) {
    const r = priceReturn(prev[id], p);
    if (r !== null) out[id] = r;
  }
  return out;
}
