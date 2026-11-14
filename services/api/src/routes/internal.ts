import { aiUsage } from "@listed/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../deps";
import { aiBudget, aiCostReport, costUsd, parsePriceTable, priceFor } from "../lib/ai-cost";
import { parse, requireServiceToken } from "../lib/validate";

const tokens = z.number().int().min(0).max(50_000_000);

const recordSchema = z.object({
  service: z.string().trim().min(1).max(40).default("agents"),
  company: z.string().trim().toUpperCase().max(16).nullish(),
  feature: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(200),
  promptTokens: tokens.default(0),
  completionTokens: tokens.default(0),
  totalTokens: tokens.optional(),
  latencyMs: z.number().int().min(0).max(3_600_000).nullish(),
  costUsd: z.number().min(0).max(10_000).optional(),
  ok: z.boolean().default(true),
  error: z.string().max(500).nullish(),
  requestId: z.string().max(200).nullish(),
  at: z.string().datetime().optional(),
});

export type AiUsageInput = z.infer<typeof recordSchema>;

export function dailyBudgetUsd(env: NodeJS.ProcessEnv = process.env): number | null {
  const v = Number(env.AI_DAILY_BUDGET_USD?.trim().split(/\s/)[0]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function internalRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;
  const table = parsePriceTable(process.env.AI_PRICE_TABLE);
  const budget = dailyBudgetUsd();

  app.post("/internal/ai-usage", { bodyLimit: 512 * 1024 }, async (req, reply) => {
    requireServiceToken(deps, req);
    const body = parse(z.union([z.object({ records: z.array(recordSchema).min(1).max(500) }), recordSchema]), req.body);
    const records = "records" in body ? body.records : [body];
    const rows = records.map((r) => {
      const total = r.totalTokens ?? r.promptTokens + r.completionTokens;
      return {
        service: r.service,
        company: r.company || null,
        feature: r.feature,
        model: r.model,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: total,
        latencyMs: r.latencyMs ?? null,
        costUsd: r.costUsd ?? costUsd(priceFor(table, r.model), r.promptTokens, r.completionTokens, total),
        ok: r.ok,
        error: r.error ?? null,
        requestId: r.requestId ?? null,
        ...(r.at ? { at: new Date(r.at) } : {}),
      };
    });
    const inserted = await db.insert(aiUsage).values(rows).onConflictDoNothing().returning({ id: aiUsage.id, costUsd: aiUsage.costUsd });
    for (const r of rows) req.log.info({ ai: { service: r.service, company: r.company, feature: r.feature, model: r.model, tokens: r.totalTokens, costUsd: r.costUsd, ok: r.ok } }, "ai usage");
    reply.status(201);
    return { stored: inserted.length, duplicates: rows.length - inserted.length, budget: await aiBudget(db, budget) };
  });

  app.get<{ Querystring: { days?: string } }>("/internal/ai-cost", async (req) => {
    requireServiceToken(deps, req);
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    return aiCostReport(db, days, budget);
  });

  app.get("/internal/ai-budget", async (req) => {
    requireServiceToken(deps, req);
    return aiBudget(db, budget);
  });
}
