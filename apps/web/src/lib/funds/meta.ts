import {
  BASKET_LABELS,
  FUND_COLORS,
  FUND_SEEDS,
  VIZ_COLORS,
  type BasketId,
  type BrainTier,
  type FundStatus,
  type Mandate,
  type ReputationEventKind,
  type SeedFundId,
  type VizColor,
} from "@listed/shared";

export type FundColor = VizColor;

const PASTEL: Record<VizColor, "sky" | "mint" | "pink" | "lime" | "lavender"> = {
  cobalt: "sky",
  teal: "mint",
  clay: "pink",
  gold: "lime",
  plum: "lavender",
};

function isSeed(id: string): id is SeedFundId {
  return Object.prototype.hasOwnProperty.call(FUND_COLORS, id);
}

export function fundColor(id: string): FundColor {
  const key = id.toLowerCase();
  if (isSeed(key)) return FUND_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return VIZ_COLORS[h % VIZ_COLORS.length] ?? "cobalt";
}

export const fundColorVar = (id: string) => `var(--viz-${fundColor(id)})`;
export const fundPastelVar = (id: string) => `var(--${PASTEL[fundColor(id)]})`;

export function fundName(id: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const key = id.toLowerCase();
  if (isSeed(key)) return FUND_SEEDS[key].name;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export const MANDATE_LABEL: Record<Mandate, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  growth: "Growth",
  contrarian: "Contrarian",
  aggressive: "Aggressive",
};

export const MANDATE_LINE: Record<Mandate, string> = {
  conservative: "Large caps, banks and dividend payers.",
  balanced: "A bit of everything, no big bets.",
  growth: "AI, chips, big tech and startups.",
  contrarian: "Buys what has fallen, sells what ran.",
  aggressive: "Startups and high-beta names.",
};

export const MANDATE_RISK: Record<Mandate, number> = { conservative: 0, balanced: 1, contrarian: 2, growth: 3, aggressive: 4 };

export const BRAIN_LABEL: Record<BrainTier, string> = { best: "Best brain", primary: "Standard brain", small: "Small brain" };
export const BRAIN_RULE: Record<BrainTier, string> = {
  best: "Fund value $3M or more",
  primary: "Fund value $1M to $3M",
  small: "Fund value under $1M",
};

export const STATUS_LABEL: Record<FundStatus, string> = { active: "Active", autopilot: "On autopilot", liquidated: "Liquidated" };

export function basketLabel(id: BasketId | string): string {
  return (BASKET_LABELS as Record<string, string>)[id] ?? id;
}

export const BASKET_TONE: Record<BasketId, string> = {
  ai_chips: "var(--viz-plum)",
  big_tech: "var(--viz-cobalt)",
  finance: "var(--viz-teal)",
  energy_ev: "var(--viz-gold)",
  consumer: "var(--viz-clay)",
  healthcare: "var(--mint)",
  india: "var(--sky)",
  startups: "var(--lavender)",
  crypto: "var(--viz-slate)",
};

export function reputationTone(score: number): "red" | "amber" | "green" {
  if (score < 40) return "red";
  if (score < 60) return "amber";
  return "green";
}

export const REPUTATION_EVENT_LABEL: Record<ReputationEventKind, string> = {
  turnover_excess: "Too much churn",
  flip_flop: "Flip-flop",
  pump_dump: "Pump and dump",
  broken_deal: "Broken deal",
  missed_promise: "Missed promise",
  front_running: "Front-running",
  low_churn: "Calm day",
  beat_spy: "Beat the market",
  honoured_deal: "Honoured deal",
  kept_promise: "Kept promise",
  anchor: "Anchored on-chain",
};

export const HOLDINGS_COUNT = 10;
