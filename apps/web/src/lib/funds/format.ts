import { FUND_COIN_DECIMALS, GAME_USD_PER_NEAR_DEFAULT, yoctoToNear } from "@listed/shared";

const nf = (min: number, max: number, compact = false) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max, notation: compact ? "compact" : "standard" });

const MINUS = "−";

export function usd(n: number | null | undefined, opts: { compact?: boolean; digits?: number; signed?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const digits = opts.digits ?? (opts.compact && a >= 1000 ? 2 : a >= 1 || a === 0 ? 2 : 4);
  const body = opts.compact && a >= 1000 ? nf(0, digits, true).format(a) : nf(Math.min(2, digits), digits).format(a);
  const sign = n < 0 ? MINUS : opts.signed && n > 0 ? "+" : "";
  return `${sign}$${body}`;
}

export function price(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const d = a >= 1000 ? 2 : a >= 100 ? 2 : a >= 1 ? 4 : 4;
  return `$${nf(d, d).format(n)}`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const r = Number(n.toFixed(digits));
  if (r === 0) return `${(0).toFixed(digits)}%`;
  return `${r > 0 ? "+" : MINUS}${Math.abs(r).toFixed(digits)}%`;
}

export function pp(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const r = Number(n.toFixed(digits));
  if (r === 0) return `${(0).toFixed(digits)} pp`;
  return `${r > 0 ? "+" : MINUS}${Math.abs(r).toFixed(digits)} pp`;
}

export function bps(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n / 100).toFixed(digits)}%`;
}

export function bpsDelta(n: number): string {
  const v = n / 100;
  if (v === 0) return "0.0 pts";

  const d = Math.abs(v) < 0.1 ? 2 : 1;
  return `${v > 0 ? "+" : MINUS}${Math.abs(v).toFixed(d)} pts`;
}

export function coinsToNumber(raw: string | bigint | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const s = typeof raw === "bigint" ? raw.toString() : raw;
  const neg = s.startsWith("-");
  const digits = (neg ? s.slice(1) : s).padStart(FUND_COIN_DECIMALS + 1, "0");
  const whole = digits.slice(0, -FUND_COIN_DECIMALS);
  const frac = digits.slice(-FUND_COIN_DECIMALS, -FUND_COIN_DECIMALS + 8);
  const v = Number(`${whole}.${frac}`);
  return neg ? -v : v;
}

export function coinsToRaw(input: string): string | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  const [w = "0", f = ""] = s.split(".");
  const frac = (f + "0".repeat(FUND_COIN_DECIMALS)).slice(0, FUND_COIN_DECIMALS);
  const raw = BigInt(w || "0") * BigInt(10) ** BigInt(FUND_COIN_DECIMALS) + BigInt(frac || "0");
  return raw.toString();
}

export function coins(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  return nf(a >= 1 ? 2 : 4, a >= 1 ? 2 : 4).format(n);
}

export function nearToUsd(yocto: string | bigint | null | undefined, rate = GAME_USD_PER_NEAR_DEFAULT): number {
  if (yocto === null || yocto === undefined || yocto === "") return 0;
  return yoctoToNear(yocto) * rate;
}

export function usdToNear(n: number, rate = GAME_USD_PER_NEAR_DEFAULT): string {
  if (!Number.isFinite(n) || n <= 0 || rate <= 0) return "0";
  return (n / rate).toFixed(6).replace(/\.?0+$/, "");
}

export function toneOf(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || Math.abs(n) < 0.05) return "text-ink-2";
  return n > 0 ? "text-up" : "text-down";
}

export function until(iso: string | null | undefined, now: number | null): string {
  if (!iso || now === null) return "—";
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "ended";
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  return `in ${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export interface ClockSecs {
  bellSecs: number;
  quarterSecs: number;
  quarters: number;
}
export const SPEC_CLOCK: ClockSecs = { bellSecs: 900, quarterSecs: 86_400, quarters: 4 };

export function spanWords(secs: number): string {
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (secs % 86_400 === 0) return unit(secs / 86_400, "day");
  if (secs % 3_600 === 0) return unit(secs / 3_600, "hour");
  if (secs % 60 === 0) return unit(secs / 60, "minute");
  return unit(Math.round(secs), "second");
}

export function clockWords(c?: Partial<ClockSecs> | null) {
  const bellSecs = c?.bellSecs && c.bellSecs > 0 ? c.bellSecs : SPEC_CLOCK.bellSecs;
  const quarterSecs = c?.quarterSecs && c.quarterSecs > 0 ? c.quarterSecs : SPEC_CLOCK.quarterSecs;
  const quarters = c?.quarters && c.quarters > 0 ? c.quarters : SPEC_CLOCK.quarters;
  const bell = spanWords(bellSecs);
  const perQuarter = Math.max(1, Math.round(quarterSecs / bellSecs));
  const quarter = spanWords(quarterSecs);
  const season = spanWords(quarterSecs * quarters);
  const quarterIsDay = quarterSecs === 86_400;
  return {

    every: `every ${bell}`,

    everyShort: `every ${bell.replace(/ minutes?$/, " min").replace(/ seconds?$/, " s")}`,
    bell,
    quarter,
    season,
    quarters,
    perQuarter,

    line: `${perQuarter} bells ${quarterIsDay ? "a day" : "a quarter"} · quarter = ${quarter} · season = ${quarters} quarters`,
  };
}
