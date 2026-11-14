import { FUND_SEEDS, type FundId } from "@listed/shared";

export function pct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export function signedPct(bps: number): string {
  const v = (bps / 100).toFixed(1);
  if (v === "0.0" || v === "-0.0") return "0.0%";
  return bps > 0 ? `+${v}%` : `−${v.slice(1)}%`;
}

export function ratioPct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

export function usd(x: number): string {
  const n = Math.round(Math.abs(x));
  const s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${x < 0 ? "−" : ""}$${s}`;
}

export function fundName(id: FundId, names: Record<FundId, string>): string {
  return names[id] ?? FUND_SEEDS[id as keyof typeof FUND_SEEDS]?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
