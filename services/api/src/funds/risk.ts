import type { FundRow, Mandate, RecommendedFund, RiskProfileId, RiskProfileRequest, RiskProfileResponse } from "@listed/shared";

export function profileOf(a: RiskProfileRequest): { profile: RiskProfileId; points: number } {
  const points = a.drawdown + a.horizon + a.goal;
  return { profile: points <= 2 ? "conservative" : points <= 4 ? "moderate" : "aggressive", points };
}

export const MANDATE_FIT: Record<RiskProfileId, Record<Mandate, number>> = {
  conservative: { conservative: 100, balanced: 70, contrarian: 40, growth: 30, aggressive: 10 },
  moderate: { balanced: 100, growth: 75, contrarian: 70, conservative: 65, aggressive: 35 },
  aggressive: { aggressive: 100, growth: 90, contrarian: 65, balanced: 45, conservative: 15 },
};

const PROFILE_COPY: Record<RiskProfileId, { label: string; summary: string }> = {
  conservative: { label: "Careful", summary: "You want steady money with small swings. Funds that hold large caps, banks and dividends suit you best." },
  moderate: { label: "Balanced", summary: "You can sit through some swings to beat the market. A mix of steady stocks and growth suits you best." },
  aggressive: { label: "Bold", summary: "You accept big swings for big wins. Funds that hold startups, AI and high-beta stocks suit you best." },
};

const MANDATE_WORDS: Record<Mandate, string> = {
  conservative: "large caps, banks and dividends",
  balanced: "a balanced mix",
  growth: "AI, chips, tech and startups",
  contrarian: "stocks that have fallen",
  aggressive: "startups and high-beta stocks",
};

const clamp = (x: number) => Math.max(0, Math.min(100, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const signed = (x: number) => {
  const v = Math.round(x * 10) / 10 || 0; // no "-0.0"
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
};

export function rankForProfile(profile: RiskProfileId, funds: FundRow[]): RecommendedFund[] {
  const ranked = funds
    .filter((f) => f.status !== "liquidated")
    .map((f) => {
      const mandateFit = MANDATE_FIT[profile][f.mandate] ?? 50;
      const returnScore = f.retSeason === null ? 50 : clamp(50 + 5 * f.retSeason);
      const score = 0.6 * mandateFit + 0.25 * clamp(f.reputation) + 0.15 * returnScore;
      const parts = [`Holds ${MANDATE_WORDS[f.mandate]}`, `reputation ${Math.round(f.reputation)}`];
      if (f.retSeason !== null) parts.push(`season ${signed(f.retSeason)}${f.vsSpy !== null ? ` (${signed(f.vsSpy)} vs SPY)` : ""}`);
      const why = `${parts.join(", ")}.${f.reputation < 40 ? " Low reputation: other AI funds avoid it." : ""}`;
      return { fund: f.id, name: f.name, mandate: f.mandate, score: r1(clamp(score)), mandateFit, reputation: r1(f.reputation), seasonReturn: f.retSeason, why };
    });

  const red = (r: RecommendedFund) => (r.reputation < 40 ? 1 : 0);
  return ranked.sort((a, b) => red(a) - red(b) || b.score - a.score || b.mandateFit - a.mandateFit || a.fund.localeCompare(b.fund));
}

export function riskProfile(answers: RiskProfileRequest, funds: FundRow[]): RiskProfileResponse {
  const { profile, points } = profileOf(answers);
  return { profile, points, ...PROFILE_COPY[profile], recommended: rankForProfile(profile, funds) };
}
