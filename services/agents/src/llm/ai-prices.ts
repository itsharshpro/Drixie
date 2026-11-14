import { billedTokens, type TokenUsage } from "./types.js";

export interface UsdPrice {
  in: number; // USD per 1M prompt tokens
  out: number; // USD per 1M completion (incl. thinking) tokens
}

export type PriceKey = "small" | "primary" | "best" | "judge" | "default";

export const DEFAULT_AI_PRICES: Readonly<Record<PriceKey, UsdPrice>> = {
  small: { in: 0.25, out: 1.5 },
  primary: { in: 0.6, out: 4 },
  best: { in: 2.5, out: 15 },
  judge: { in: 0.6, out: 4 },
  default: { in: 2.5, out: 15 },
};

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export class AiPriceTable {
  private readonly table = new Map<string, UsdPrice>();
  readonly warnings: string[] = [];

  constructor(
    json: string | undefined,
    private readonly tiers: ReadonlyMap<string, PriceKey> = new Map(),
  ) {
    if (!json) return;
    try {
      const obj = JSON.parse(json) as Record<string, { in?: unknown; out?: unknown }>;
      for (const [k, v] of Object.entries(obj)) {
        const i = num(v?.in);
        const o = num(v?.out);
        if (i === null || o === null) {
          this.warnings.push(`AI_PRICE_TABLE entry ${Object.keys(obj).indexOf(k) + 1} is not {in, out} numbers; ignored`);
          continue;
        }
        this.table.set(k, { in: i, out: o });
      }
    } catch {
      this.warnings.push("AI_PRICE_TABLE is not valid JSON; using the built-in conservative prices");
    }
  }

  priceOf(model: string): UsdPrice & { source: "model" | "tier" | "default" } {

    const exact = this.table.get(model);
    if (exact) return { ...exact, source: "model" };
    const tier = this.tiers.get(model);
    const t = tier ? this.table.get(tier) : undefined;
    if (t) return { ...t, source: "tier" };
    const d = this.table.get("default");
    if (d) return { ...d, source: "default" };
    return { ...DEFAULT_AI_PRICES[tier ?? "default"], source: "default" };
  }

  costUsd(model: string, usage: TokenUsage): number {
    const p = this.priceOf(model);
    const out = Math.max(0, billedTokens(usage) - usage.promptTokens);
    return (usage.promptTokens * p.in + out * p.out) / 1_000_000;
  }
}

export function tierMap(models: { small?: string; primary?: string; best?: string; judge?: string }): Map<string, PriceKey> {
  const out = new Map<string, PriceKey>();
  const order: [PriceKey, string | undefined][] = [
    ["judge", models.judge],
    ["small", models.small],
    ["primary", models.primary],
    ["best", models.best],
  ];
  for (const [tier, id] of order) if (id) out.set(id, tier);
  return out;
}
