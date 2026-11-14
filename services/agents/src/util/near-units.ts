export const YOCTO_PER_NEAR = 10n ** 24n;

export function nearToYoctoBig(near: string): bigint {
  const s = near.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid NEAR amount "${near}"`);
  const [w = "0", f = ""] = s.split(".");
  const frac = (f + "0".repeat(24)).slice(0, 24);
  return BigInt(w) * YOCTO_PER_NEAR + BigInt(frac);
}

export function yoctoToNearStr(yocto: bigint | string, digits = 4): string {
  const v = typeof yocto === "bigint" ? yocto : BigInt(yocto || "0");
  const neg = v < 0n;
  const a = neg ? -v : v;
  const scale = 10n ** BigInt(24 - digits);
  const rounded = (a + scale / 2n) / scale; // round half up at `digits`
  const whole = rounded / 10n ** BigInt(digits);
  const frac = (rounded % 10n ** BigInt(digits)).toString().padStart(digits, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export function bps(amount: bigint, basisPoints: number | bigint): bigint {
  return (amount * BigInt(basisPoints)) / 10_000n;
}

export function minBig(...xs: bigint[]): bigint {
  return xs.reduce((m, x) => (x < m ? x : m));
}

export function maxBig(...xs: bigint[]): bigint {
  return xs.reduce((m, x) => (x > m ? x : m));
}

export function clampBig(x: bigint, lo: bigint, hi: bigint): bigint {
  return x < lo ? lo : x > hi ? hi : x;
}

export function roundPrice(yocto: bigint): bigint {
  const step = 10n ** 20n; // 0.0001 NEAR
  return ((yocto + step / 2n) / step) * step;
}

export function ratio(a: bigint, b: bigint): number {
  if (b === 0n) return a === 0n ? 1 : Number.POSITIVE_INFINITY;
  const scaled = (a * 1_000_000n) / b;
  return Number(scaled) / 1_000_000;
}
