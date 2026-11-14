import type { Mandate } from "@listed/shared";

export type RiskLevel = 1 | 2 | 3 | 4;

export interface Persona {
  line: string;
  risk: RiskLevel;
}

export const RISK_LABEL: Record<RiskLevel, string> = { 1: "Low risk", 2: "Medium risk", 3: "High risk", 4: "Very high risk" };

const SEED: Record<string, Persona> = {
  atlas: { line: "The steady hand", risk: 1 },
  meridian: { line: "The all-rounder", risk: 2 },
  nova: { line: "The momentum chaser", risk: 3 },
  orion: { line: "The contrarian", risk: 2 },
  kite: { line: "The startup hunter", risk: 4 },
};

const BY_MANDATE: Record<Mandate, Persona> = {
  conservative: { line: "The steady hand", risk: 1 },
  balanced: { line: "The all-rounder", risk: 2 },
  growth: { line: "The momentum chaser", risk: 3 },
  contrarian: { line: "The contrarian", risk: 2 },
  aggressive: { line: "The startup hunter", risk: 4 },
};

export function personaOf(fund: string, mandate?: Mandate | null): Persona {
  return SEED[fund.toLowerCase()] ?? (mandate ? BY_MANDATE[mandate] : { line: "AI fund manager", risk: 2 });
}

export { fundColorVar, fundPastelVar } from "@/lib/funds/meta";

export const fundTint = (colorVar: string, pct: number) => `color-mix(in oklab, ${colorVar} ${Math.round(pct)}%, var(--paper))`;
