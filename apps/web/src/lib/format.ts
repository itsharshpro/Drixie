import { formatShares, sharesToNumber, yoctoToNear } from "@listed/shared";

export { formatShares, sharesToNumber, yoctoToNear };

export function formatPrice(yocto: string | bigint): string {
  const n = yoctoToNear(yocto);
  const d = priceDigits(n);
  return formatNumber(n, d, { min: d });
}

export function priceDigits(n: number): number {
  const a = Math.abs(n);
  if (a >= 1) return 2;
  if (a === 0 || a >= 0.0001) return 4;
  return 6;
}

export const NEAR_FLOOR = 0.0001;

export function formatNear(v: string | bigint, opts: { digits?: number; compact?: boolean } = {}): string {
  const n = yoctoToNear(v);
  const a = Math.abs(n);
  const max = opts.digits ?? (a >= 1 ? 2 : 4);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: max,
    minimumFractionDigits: Math.min(2, max),
    notation: opts.compact ? "compact" : "standard",
  }).format(n);
}

export function axisDigits(ticks: number[], hi: number): number {
  const base = priceDigits(hi);
  if (ticks.length < 2) return base;
  let step = Infinity;
  for (let i = 1; i < ticks.length; i++) step = Math.min(step, Math.abs(ticks[i]! - ticks[i - 1]!));
  if (!Number.isFinite(step) || step <= 0) return base;
  const need = Math.ceil(-Math.log10(step) - 1e-9);
  return Math.min(8, Math.max(base, need));
}

export function tickDigits(ticks: readonly number[]): number {
  let step = Infinity;
  for (let i = 1; i < ticks.length; i++) step = Math.min(step, Math.abs(ticks[i]! - ticks[i - 1]!));
  if (!Number.isFinite(step) || step <= 0) return 0;
  return Math.min(8, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
}

export function formatTick(t: number, digits: number): string {
  return formatNumber(t, digits, { min: digits });
}

export function formatNumber(n: number, digits = 2, opts: { compact?: boolean; min?: number } = {}): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: opts.min ?? Math.min(2, digits),
    notation: opts.compact ? "compact" : "standard",
  }).format(n);
}

export function formatInt(n: number, compact = false): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: compact ? 1 : 0, notation: compact ? "compact" : "standard" }).format(n);
}

function toBig(yocto: string | bigint): bigint {
  if (typeof yocto === "bigint") return yocto;
  const s = String(yocto);
  return BigInt(/^-?\d+$/.test(s) ? s : "0");
}

export function formatNearAmount(yocto: string | bigint, opts: { digits?: number; fixed?: boolean } = {}): string {
  const b = toBig(yocto);
  const abs = b < BigInt(0) ? -b : b;
  const n = yoctoToNear(abs);
  if (abs > BigInt(0) && n < NEAR_FLOOR && opts.digits === undefined) return `<${NEAR_FLOOR}`;
  if (opts.fixed) {
    const d = opts.digits ?? (n >= 1 ? 2 : 4);
    return formatNumber(yoctoToNear(b), d, { min: d });
  }
  return formatNear(b, opts.digits !== undefined ? { digits: opts.digits } : {});
}

export function exactNear(yocto: string | bigint): string {
  const n = yoctoToNear(toBig(yocto));
  return `${new Intl.NumberFormat("en-US", { maximumSignificantDigits: 8, maximumFractionDigits: 24 }).format(n)} NEAR`;
}

export function formatNearCompact(yocto: string | bigint): string {
  const n = yoctoToNear(yocto);
  if (Math.abs(n) >= 10_000) return formatNumber(n, 1, { compact: true, min: 0 });
  return formatNear(yocto);
}

export function formatSharesCompact(units: string | bigint): string {
  const n = sharesToNumber(units);
  if (Math.abs(n) >= 100_000) return formatNumber(n, 1, { compact: true, min: 0 });
  return formatNumber(n, n >= 100 ? 0 : 2, { min: 0 });
}

export function formatChange(pct: number | null | undefined, digits = 1): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  const abs = Math.abs(pct).toFixed(digits);
  if (Number(abs) === 0) return `${(0).toFixed(digits)}%`;
  return `${pct > 0 ? "+" : "−"}${abs}%`;
}

export function formatRatio(r: number | null | undefined, digits = 1): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return "—";
  return `${(r * 100).toFixed(digits)}%`;
}

export function direction(n: number | bigint | null | undefined): "up" | "down" | "flat" {
  if (n === null || n === undefined) return "flat";
  if (typeof n === "bigint") return n > BigInt(0) ? "up" : n < BigInt(0) ? "down" : "flat";
  return n > 0 ? "up" : n < 0 ? "down" : "flat";
}

export function signedNear(yocto: string): string {
  const b = BigInt(yocto || "0");
  const s = formatNear(b < BigInt(0) ? -b : b);
  if (b === BigInt(0)) return s;
  return `${b > BigInt(0) ? "+" : "−"}${s}`;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function timeAgo(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = Math.max(0, now - t);
  if (d < 5_000) return "now";
  if (d < MIN) return `${Math.floor(d / 1000)}s`;
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  return `${Math.floor(d / DAY)}d`;
}

export function formatAgo(at: string | number | Date, now: number): string {
  const t = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at);
  if (Number.isNaN(t)) return "";
  const d = Math.max(0, now - t);
  if (d < 5_000) return "just now";
  if (d < MIN) return `${Math.floor(d / 1000)}s ago`;
  if (d < HOUR) return `${Math.floor(d / MIN)}m ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`;
  return `${Math.floor(d / DAY)}d ago`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function toDate(at: string | number | Date): Date {
  return at instanceof Date ? at : new Date(at);
}

export function formatClock(at: string | number | Date, withSeconds = false): string {
  const t = toDate(at);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined, hourCycle: "h23" });
}

export function formatDateTime(at: string | number | Date): string {
  const t = toDate(at);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function formatDay(at: string | number | Date): string {
  const t = toDate(at);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatTime(at: string | number | Date, withSeconds = false): string {
  return formatClock(at, withSeconds);
}

export const SERVICE_LABEL: Record<string, string> = {
  summarize: "Summaries",
  translate: "Translation",
  proofread: "Proofreading",
  research: "NEAR research",
  copywrite: "Copywriting",
};

export const SERVICE_NOUN: Record<string, string> = {
  summarize: "a summary",
  translate: "a translation",
  proofread: "a proofread",
  research: "a research report",
  copywrite: "some copy",
};

export function serviceLabel(slug: string): string {
  return SERVICE_LABEL[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}
