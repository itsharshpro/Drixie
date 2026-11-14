export type FunctionCallSpec = { methodName: string; args: object; gas?: string; deposit?: string };

const TGAS = BigInt(1_000_000_000_000);
export const GAS = {
  default: (BigInt(50) * TGAS).toString(),
  trade: (BigInt(60) * TGAS).toString(),
  order: (BigInt(60) * TGAS).toString(),
  bell: (BigInt(250) * TGAS).toString(),
  create: (BigInt(300) * TGAS).toString(),
} as const;

export function withSlippage(expected: string, bps: number): string {
  const v = BigInt(expected || "0");
  if (v <= BigInt(0)) return "0";
  return ((v * BigInt(10_000 - bps)) / BigInt(10_000)).toString();
}

export const DEFAULT_SLIPPAGE_BPS = 100; // 1%
