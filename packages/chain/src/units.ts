export const YOCTO_PER_NEAR = 10n ** 24n;
export const TGAS = 10n ** 12n;
export const DEFAULT_CALL_GAS = 30n * TGAS;
export const MAX_TX_GAS = 300n * TGAS;

export function nearToYoctoBig(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toString() : amount.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid NEAR amount "${amount}"`);
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > 24) throw new Error(`NEAR amount "${amount}" has more than 24 decimals`);
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt(frac.padEnd(24, "0") || "0");
}

export function yoctoToNearString(yocto: bigint | string, digits = 4): string {
  const v = typeof yocto === "string" ? BigInt(yocto) : yocto;
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / YOCTO_PER_NEAR;
  const frac = (abs % YOCTO_PER_NEAR).toString().padStart(24, "0").slice(0, digits).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export const tgas = (n: number | bigint): bigint => BigInt(n) * TGAS;

export function withSlippage(amount: bigint | string, bps: number): bigint {
  const v = BigInt(amount);
  return (v * BigInt(10_000 - bps)) / 10_000n;
}
