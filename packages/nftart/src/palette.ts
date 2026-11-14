import { FUND_COLORS, type FundId } from "@listed/shared";

export const INK = "#0F1117";
export const PAPER = "#FFFFFF";
export const CANVAS = "#F6F7FB";
export const BRAND = "#2B44D9";
export const GOLD = "#B4822F";

export const GOLD_TEXT = "#866228";
export const UP = "#0A7D53";
export const DOWN = "#D42A3C";
export const CANDLE_UP = "#12B886";
export const CANDLE_DOWN = "#F0465A";

export const PASTEL = { lime: "#E6F05A", lavender: "#C3B3F3", mint: "#A8F3DD", pink: "#F4B6CF", sky: "#BFD9FF" } as const;
export const VIZ = { cobalt: "#2B44D9", teal: "#0E9F86", gold: "#B4822F", plum: "#7A5AE0", clay: "#D9487F", slate: "#5F6776" } as const;

export const A = { ink2: 0.64, ink3: 0.48, line: 0.08, lineStrong: 0.16, fill: 0.04 } as const;

export type VizTone = "cobalt" | "teal" | "plum" | "gold" | "clay";

export interface FundTheme {
  tone: VizTone;

  deep: string;

  pastel: string;
}

const PAIRS: Record<VizTone, FundTheme> = {
  cobalt: { tone: "cobalt", deep: VIZ.cobalt, pastel: PASTEL.sky },
  teal: { tone: "teal", deep: VIZ.teal, pastel: PASTEL.mint },
  plum: { tone: "plum", deep: VIZ.plum, pastel: PASTEL.lavender },
  gold: { tone: "gold", deep: VIZ.gold, pastel: PASTEL.lime },
  clay: { tone: "clay", deep: VIZ.clay, pastel: PASTEL.pink },
};
const ORDER: VizTone[] = ["cobalt", "teal", "plum", "gold", "clay"];

export function fundTheme(fund: FundId | null | undefined): FundTheme {
  if (!fund) return { tone: "cobalt", deep: VIZ.slate, pastel: CANVAS };
  const seeded = FUND_COLORS[fund as keyof typeof FUND_COLORS];
  if (seeded) return PAIRS[seeded];
  let h = 0;
  for (let i = 0; i < fund.length; i++) h = (h * 31 + fund.charCodeAt(i)) >>> 0;
  return PAIRS[ORDER[h % ORDER.length]!];
}

export function tint(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * t));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
