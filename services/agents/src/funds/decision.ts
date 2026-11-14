import { z } from "zod";
import type { Plan } from "./rules.js";

export type ThinkMode = "normal" | "deep";

export interface CrossOrder {
  fund: string;
  side: "buy" | "sell";
  usd: number;
}

export interface DealOffer {
  to: string;
  ticker: string;
  bps: number;
  premium_bps: number;
}

export interface Decision {
  plan: Plan;
  cross: CrossOrder[];
  deals: DealOffer[];
  note: string;
  think: ThinkMode;
  promise: { targetBps: number; bondBps: number } | null;
}

export class DecisionParseError extends Error {}

const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);

const Raw = z.object({
  weights: z.union([z.record(num), z.array(z.object({ asset: z.string(), bps: num }))]),
  cash_bps: num.optional(),
  cross: z.array(z.object({ fund: z.string(), side: z.string(), usd: num })).optional().catch([]),
  deals: z.array(z.object({ to: z.string(), ticker: z.string(), bps: num, premium_bps: num.optional() })).optional().catch([]),
  note: z.string().optional(),
  think: z.string().optional(),
  promise: z.object({ target_bps: num, bond_bps: num }).nullable().optional().catch(null),
});

export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new DecisionParseError("the reply has no JSON object");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new DecisionParseError("the reply is not valid JSON");
  }
}

const TRAIT_LEAK = /\b(risk|patience|greed|loyalty|smarts)\b\s*(?:is|=|:)?\s*\d{1,2}\s*\/\s*10/gi;

export function cleanNote(raw: string | undefined, fallback: string): string {
  let s = (raw ?? "").replace(TRAIT_LEAK, "").replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
  if (!s) s = fallback;
  if (s.length > 280) s = `${s.slice(0, 277).replace(/\s+\S*$/, "")}…`;
  return s;
}

export function parseDecision(text: string, assetIds: readonly string[], fundIds: readonly string[], self: string): Decision {
  const parsed = Raw.safeParse(extractJson(text));
  if (!parsed.success) throw new DecisionParseError(`the JSON does not match the decision format (${parsed.error.issues[0]?.path.join(".") || "root"})`);
  const r = parsed.data;
  const byLower = new Map(assetIds.map((id) => [id.toLowerCase(), id]));
  const weights: Record<string, number> = {};
  const entries: [string, number][] = Array.isArray(r.weights) ? r.weights.map((w) => [w.asset, w.bps]) : Object.entries(r.weights);
  for (const [k, v] of entries) {
    const id = byLower.get(k.trim().toLowerCase());
    const b = Math.round(Number(v));
    if (id && Number.isFinite(b) && b > 0) weights[id] = (weights[id] ?? 0) + b;
  }
  const funds = new Set(fundIds);
  const cross: CrossOrder[] = [];
  for (const c of r.cross ?? []) {
    const fund = c.fund.trim().toLowerCase();
    const side = c.side.trim().toLowerCase();
    const usd = Number(c.usd);
    if (funds.has(fund) && fund !== self && (side === "buy" || side === "sell") && usd > 0 && Number.isFinite(usd)) cross.push({ fund, side, usd: Math.round(usd) });
  }
  const deals: DealOffer[] = (r.deals ?? [])
    .map((d) => ({ to: d.to.trim().toLowerCase(), ticker: byLower.get(d.ticker.trim().toLowerCase()) ?? "", bps: Math.round(Number(d.bps)), premium_bps: Math.round(Number(d.premium_bps ?? 0)) }))
    .filter((d) => funds.has(d.to) && d.to !== self && d.ticker && d.bps > 0 && d.bps <= 1000 && Math.abs(d.premium_bps) <= 300);
  const think: ThinkMode = r.think?.trim().toLowerCase() === "deep" ? "deep" : "normal";
  const cash = Math.round(Number(r.cash_bps ?? 0));
  const promise = r.promise ? { targetBps: Math.round(Number(r.promise.target_bps)), bondBps: Math.round(Number(r.promise.bond_bps)) } : null;
  return {
    plan: { weights, cashBps: Number.isFinite(cash) ? Math.max(0, cash) : 0 },
    cross,
    deals,
    note: cleanNote(r.note, "Rebalanced to the plan."),
    think,
    promise: promise && promise.targetBps > 0 && promise.bondBps > 0 ? promise : null,
  };
}
