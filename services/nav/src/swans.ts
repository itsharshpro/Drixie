import { sha256Hex, STARTUP_WINTER_BPS } from "@listed/fundmath";

export const BLACK_SWAN_KINDS = ["startup_winter", "retail_frenzy", "compute_crunch", "rate_shock"] as const;
export type BlackSwanKind = (typeof BLACK_SWAN_KINDS)[number];

export const BLACK_SWAN_INFO: Record<BlackSwanKind, { title: string; effect: string }> = {
  startup_winter: { title: "Startup winter", effect: `Every startup mark falls ${Math.abs(STARTUP_WINTER_BPS) / 100}% today.` },
  retail_frenzy: { title: "Retail frenzy", effect: "House investors pile into the top fund." },
  compute_crunch: { title: "Compute crunch", effect: "Brain bills cost double for the rest of the quarter." },
  rate_shock: { title: "Rate shock", effect: "Banks & Finance hold up; growth funds' coin pools lose 20% of house liquidity." },
};

export function swanSeed(clock: string, quarter: number, pricesHash: string): string {
  return sha256Hex(`swan|${clock}|${quarter}|${pricesHash}`);
}

export function rollBlackSwan(seedHex: string, chanceBps: number): BlackSwanKind | null {
  if (!/^[0-9a-f]{10,}$/.test(seedHex) || chanceBps <= 0) return null;
  const roll = parseInt(seedHex.slice(0, 8), 16) % 10_000;
  if (roll >= chanceBps) return null;
  return BLACK_SWAN_KINDS[parseInt(seedHex.slice(8, 10), 16) % BLACK_SWAN_KINDS.length] ?? null;
}
