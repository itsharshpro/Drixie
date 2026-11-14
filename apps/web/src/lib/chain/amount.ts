const TEN = BigInt(10);
const ZERO = BigInt(0);
export const YOCTO_PER_NEAR = TEN ** BigInt(24);

export const WITHDRAW_RESERVE_YOCTO = nearToYocto("0.05") as bigint;

export function nearToYocto(text: string): bigint | null {
  const s = text.replace(/[,\s]/g, "");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const [whole = "", frac = ""] = s.split(".");
  if (frac.length > 24) return null;
  return BigInt(whole || "0") * YOCTO_PER_NEAR + BigInt(frac.padEnd(24, "0") || "0");
}

export function yoctoToNear(yocto: bigint | string, digits = 4): string {
  const v = typeof yocto === "string" ? BigInt(yocto || "0") : yocto;
  const neg = v < ZERO;
  const abs = neg ? -v : v;
  const whole = abs / YOCTO_PER_NEAR;
  const frac = (abs % YOCTO_PER_NEAR).toString().padStart(24, "0").slice(0, digits).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

export function formatNear(yocto: bigint | string, digits = 4): string {
  const [whole = "0", frac] = yoctoToNear(yocto, digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

export function maxWithdrawYocto(balance: bigint | string, reserve: bigint = WITHDRAW_RESERVE_YOCTO): bigint {
  const b = typeof balance === "string" ? BigInt(balance || "0") : balance;
  const max = b - reserve;
  return max > ZERO ? max : ZERO;
}

export function maxWithdrawText(balance: bigint | string): string {
  return yoctoToNear(maxWithdrawYocto(balance), 4);
}

export type AmountCheck = { ok: true; yocto: bigint } | { ok: false; error: string };

export function checkWithdrawAmount(text: string, balance: bigint | string | null): AmountCheck {
  if (!text.trim()) return { ok: false, error: "Enter an amount in NEAR." };
  const yocto = nearToYocto(text);
  if (yocto === null) return { ok: false, error: "Enter a number, like 0.5." };
  if (yocto <= ZERO) return { ok: false, error: "Enter more than 0 NEAR." };
  if (balance !== null) {
    const max = maxWithdrawYocto(balance);
    if (yocto > max) {
      return {
        ok: false,
        error:
          max > ZERO
            ? `You can send up to ${yoctoToNear(max)} NEAR. 0.05 NEAR stays for storage and fees.`
            : "Your balance is too low to send. 0.05 NEAR stays for storage and fees.",
      };
    }
  }
  return { ok: true, yocto };
}

export function balanceIncrease(before: string | null, after: string | null): bigint | null {
  if (before === null || after === null) return null;
  const d = BigInt(after || "0") - BigInt(before || "0");
  return d > ZERO ? d : null;
}
