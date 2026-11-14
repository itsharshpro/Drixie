import type { Env } from "../config/env.js";
import { differentFamilies, modelFamily } from "./models.js";

export type Provider = "ai" | "nearai";
export type ModelTier = "small" | "primary" | "best";

export interface ModelSet {
  primary: string | undefined;
  judge: string | undefined;
  small: string | undefined;
  best: string | undefined;
}

export interface ProviderSettings {
  provider: Provider;
  baseUrl: string | undefined;

  keyLabel: string;
  key: string | undefined;
  models: ModelSet;

  signed: boolean;
}

type Reread = (name: string) => string | undefined;

export function legacyPrefix(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
  if (!v || v === "AI" || v === "NEARAI" || v === "NEAR_AI" || v === "NEAR" || !/^[A-Z][A-Z0-9_]{1,30}$/.test(v)) return null;
  return v;
}

export function providerSettings(env: Env, reread: Reread): ProviderSettings {
  const raw = (reread("LLM_PROVIDER") ?? env.LLM_PROVIDER ?? "ai").toLowerCase();
  const provider: Provider = raw === "nearai" || raw === "near-ai" || raw === "near" ? "nearai" : "ai";
  if (provider === "nearai") {
    const primary = reread("LLM_MODEL_PRIMARY") ?? env.LLM_MODEL_PRIMARY;
    return {
      provider,
      baseUrl: reread("LLM_BASE_URL") ?? env.LLM_BASE_URL,
      keyLabel: "AI key",
      key: env.NEARAI_API_KEY ?? reread("NEARAI_API_KEY"),
      models: { primary, judge: reread("LLM_MODEL_JUDGE") ?? env.LLM_MODEL_JUDGE, small: primary, best: primary },
      signed: true,
    };
  }
  const legacy = legacyPrefix(raw);
  const pick = (name: string, fromEnv: string | undefined, legacySuffix?: string): string | undefined =>
    reread(name) ?? fromEnv ?? (legacy && legacySuffix ? (reread(`${legacy}_${legacySuffix}`) ?? process.env[`${legacy}_${legacySuffix}`]?.trim() ?? undefined) || undefined : undefined);
  const primary = pick("AI_MODEL_PRIMARY", env.AI_MODEL_PRIMARY, "MODEL_PRIMARY");
  return {
    provider,
    baseUrl: pick("AI_BASE_URL", env.AI_BASE_URL, "BASE_URL"),
    keyLabel: "AI key",
    key: pick("AI_API_KEY", env.AI_API_KEY, "API_KEY"),
    models: {
      primary,
      judge: pick("AI_MODEL_JUDGE", env.AI_MODEL_JUDGE, "MODEL_JUDGE"),
      small: pick("AI_MODEL_SMALL", env.AI_MODEL_SMALL) ?? primary,
      best: pick("AI_MODEL_BEST", env.AI_MODEL_BEST) ?? primary,
    },
    signed: false,
  };
}

export function settingsProblem(p: ProviderSettings): string | null {
  if (p.provider === "ai" && !p.baseUrl) return "AI_BASE_URL is not set";
  if (!p.models.primary || !p.models.judge) return p.provider === "ai" ? "AI_MODEL_PRIMARY and AI_MODEL_JUDGE must be set" : "LLM_MODEL_PRIMARY and LLM_MODEL_JUDGE must be set";
  return null;
}

export function judgeProblem(provider: Provider, models: { primary: string; judge: string; small?: string; best?: string }): string | null {
  if (provider === "nearai") {
    return differentFamilies(models.primary, models.judge)
      ? null
      : `LLM_MODEL_JUDGE must be a different model family than LLM_MODEL_PRIMARY (both are ${modelFamily(models.primary)})`;
  }
  const producers = [models.primary, models.small, models.best].filter((m): m is string => Boolean(m));
  return producers.includes(models.judge) ? "AI_MODEL_JUDGE must differ from AI_MODEL_PRIMARY, AI_MODEL_SMALL and AI_MODEL_BEST" : null;
}

export function modelForTier(models: ModelSet, tier: ModelTier): string {
  const m = tier === "small" ? models.small : tier === "best" ? models.best : models.primary;
  return (m ?? models.primary ?? "") as string;
}
