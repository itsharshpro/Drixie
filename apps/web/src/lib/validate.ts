export type Validator<T = string> = (value: T) => string | null;

export const handleRule: Validator = (v) =>
  /^[a-z0-9]{3,20}$/.test(v.trim()) ? null : "Enter 3–20 lowercase letters or numbers.";

export const emailRule: Validator = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : "Enter an email like you@example.com.";

export const tickerRule: Validator = (v) =>
  /^[A-Za-z]{2,6}$/.test(v.trim()) ? null : "Use 2–6 letters, like BABEL.";

export const required =
  (what: string): Validator =>
  (v) =>
    v.trim().length > 0 ? null : `Enter ${what}.`;

export const lengthBetween =
  (what: string, min: number, max: number): Validator =>
  (v) => {
    const n = v.trim().length;
    if (n < min) return `Write at least ${min} characters for ${what}.`;
    if (n > max) return `Keep ${what} under ${max} characters.`;
    return null;
  };

const NEAR_RE = /^\d+(\.\d{1,24})?$/;

export const nearAmount =
  (opts: { min?: number; max?: number; what?: string } = {}): Validator =>
  (v) => {
    const s = v.trim();
    const what = opts.what ?? "an amount";
    if (!s) return `Enter ${what} in NEAR.`;
    if (!NEAR_RE.test(s)) return "Use numbers only, like 1.5.";
    const n = Number(s);
    if (opts.min !== undefined && n < opts.min) return `Enter at least ${opts.min} NEAR.`;
    if (opts.max !== undefined && n > opts.max) return `Enter ${opts.max} NEAR or less.`;
    if (n <= 0) return "Enter an amount above zero.";
    return null;
  };

const SHARES_RE = /^\d+(\.\d{1,18})?$/;

export const shareAmount =
  (maxShares?: number): Validator =>
  (v) => {
    const s = v.trim();
    if (!s) return "Enter how many shares to sell.";
    if (!SHARES_RE.test(s)) return "Use numbers only, like 10 or 2.5.";
    const n = Number(s);
    if (n <= 0) return "Enter more than zero shares.";
    if (maxShares !== undefined && n > maxShares) return `You have ${maxShares.toLocaleString("en-US", { maximumFractionDigits: 4 })} shares. Enter that or less.`;
    return null;
  };

export const percentBetween =
  (min: number, max: number): Validator =>
  (v) => {
    const s = v.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return `Enter a percent between ${min} and ${max}.`;
    const n = Number(s);
    if (n < min || n > max) return `Enter a percent between ${min} and ${max}.`;
    return null;
  };

export function firstError<T>(value: T, rules: Validator<T>[]): string | null {
  for (const r of rules) {
    const e = r(value);
    if (e) return e;
  }
  return null;
}

export function compareDecimal(a: string, b: string): number {
  const [aw, af = ""] = a.trim().split(".");
  const [bw, bf = ""] = b.trim().split(".");
  const len = Math.max(af.length, bf.length);
  const ai = BigInt((aw || "0") + af.padEnd(len, "0"));
  const bi = BigInt((bw || "0") + bf.padEnd(len, "0"));
  return ai === bi ? 0 : ai > bi ? 1 : -1;
}
