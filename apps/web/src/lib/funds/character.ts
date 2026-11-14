import type { FundRiskCaps, Mandate, RiskProfileId } from "@listed/shared";
import { fundColor, type FundColor } from "./meta";

export type RiskLevel = "low" | "medium" | "high" | "very_high";
export type Pastel = "sky" | "mint" | "lavender" | "lime" | "pink";

export interface FundCharacter {
  personality: string;
  risk: RiskLevel;

  profile: RiskProfileId;

  style: string;
}

const SEED: Record<string, FundCharacter> = {
  atlas: { personality: "The steady hand", risk: "low", profile: "conservative", style: "Large caps, banks and dividend payers." },
  meridian: { personality: "The all-rounder", risk: "medium", profile: "moderate", style: "A bit of every basket, no big bets." },
  nova: { personality: "The momentum chaser", risk: "high", profile: "aggressive", style: "Rides AI, chips and what is rising." },
  orion: { personality: "The contrarian", risk: "medium", profile: "moderate", style: "Buys what fell, trims what ran." },
  kite: { personality: "The startup hunter", risk: "very_high", profile: "aggressive", style: "Private startups and high-beta names." },
};

const BY_MANDATE: Record<Mandate, FundCharacter> = {
  conservative: SEED.atlas!,
  balanced: SEED.meridian!,
  growth: SEED.nova!,
  contrarian: SEED.orion!,
  aggressive: SEED.kite!,
};

export function fundCharacter(id: string, mandate?: Mandate | null): FundCharacter {
  const seed = SEED[id.toLowerCase()];
  if (seed) return seed;
  return mandate ? BY_MANDATE[mandate] : { personality: "A new manager", risk: "medium", profile: "moderate", style: "A fresh fund this season." };
}

export const RISK_LABEL: Record<RiskLevel, string> = { low: "Low risk", medium: "Medium risk", high: "High risk", very_high: "Very high risk" };
export const RISK_SHORT: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High", very_high: "Very high" };

export const RISK_STEPS: Record<RiskLevel, 1 | 2 | 3 | 4> = { low: 1, medium: 2, high: 3, very_high: 4 };
export const RISK_HELP: Record<RiskLevel, string> = {
  low: "Small swings. Big, steady companies; little in startups or crypto.",
  medium: "Moderate swings. A mix of baskets with some room for bets.",
  high: "Big swings. Concentrated in fast movers like AI and chips.",
  very_high: "The biggest swings. Up to 40% in private startups and 30% in crypto.",
};

export const PROFILE_LABEL: Record<RiskProfileId, string> = { conservative: "Conservative", moderate: "Moderate", aggressive: "Aggressive" };
export const PROFILE_LINE: Record<RiskProfileId, string> = {
  conservative: "Keep it calm",
  moderate: "Some ups and downs are fine",
  aggressive: "Swing for big wins",
};
export const PROFILES: readonly RiskProfileId[] = ["conservative", "moderate", "aggressive"];

const PASTEL: Record<FundColor, Pastel> = { cobalt: "sky", teal: "mint", plum: "lavender", gold: "lime", clay: "pink" };

export function fundPastel(id: string): Pastel {
  return PASTEL[fundColor(id)] ?? "sky";
}

export function fundTint(id: string, pct: number): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return `color-mix(in oklab, var(--viz-${fundColor(id)}) ${p}%, var(--paper))`;
}

export function mandateChips(caps: Pick<FundRiskCaps, "startupCapBps" | "basketCapBps" | "cryptoCapBps"> | null | undefined): string[] {
  if (!caps) return [];
  const p = (b: number) => `${Math.round(b / 100)}%`;
  const out = [`Startups ≤ ${p(caps.startupCapBps)}`];
  if (caps.cryptoCapBps !== undefined) out.push(caps.cryptoCapBps > 0 ? `Crypto ≤ ${p(caps.cryptoCapBps)}` : "No crypto");
  out.push(`One basket ≤ ${p(caps.basketCapBps)}`);
  return out;
}

export function matchesProfile(id: string, profile: RiskProfileId | null, mandate?: Mandate | null): boolean {
  if (!profile) return true;
  return fundCharacter(id, mandate).profile === profile;
}
