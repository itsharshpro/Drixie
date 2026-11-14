const YOCTO = 10n ** 24n;
const SHARE_UNIT = 10n ** 18n;

function toBig(v: string | bigint): bigint {
  return typeof v === "bigint" ? v : BigInt(v || "0");
}

export function yoctoToNear(v: string | bigint): number {
  const b = toBig(v);
  const neg = b < 0n;
  const a = neg ? -b : b;
  const whole = Number(a / YOCTO);
  const frac = Number(a % YOCTO) / 1e24;
  return (neg ? -1 : 1) * (whole + frac);
}

export function nearToYocto(near: string): string {
  const [w, f = ""] = near.trim().split(".");
  const frac = (f + "0".repeat(24)).slice(0, 24);
  return (BigInt(w || "0") * YOCTO + BigInt(frac || "0")).toString();
}

export function sharesToNumber(v: string | bigint): number {
  const b = toBig(v);
  return Number(b / SHARE_UNIT) + Number(b % SHARE_UNIT) / 1e18;
}

export function sharesToUnits(shares: string): string {
  const [w, f = ""] = shares.trim().split(".");
  const frac = (f + "0".repeat(18)).slice(0, 18);
  return (BigInt(w || "0") * SHARE_UNIT + BigInt(frac || "0")).toString();
}

export function formatNear(v: string | bigint, opts: { digits?: number; compact?: boolean } = {}): string {
  const n = yoctoToNear(v);
  const digits = opts.digits ?? (Math.abs(n) >= 100 ? 1 : Math.abs(n) >= 1 ? 2 : 4);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(2, digits),
    notation: opts.compact ? "compact" : "standard",
  }).format(n);
}

export function formatShares(v: string | bigint, digits = 2): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(sharesToNumber(v));
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}%`;
}

export function shortAccount(a: string): string {
  if (a.length <= 22) return a;
  return `${a.slice(0, 10)}…${a.slice(-8)}`;
}
