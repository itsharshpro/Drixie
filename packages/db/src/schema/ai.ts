import { sql } from "drizzle-orm";
import { bigserial, boolean, check, doublePrecision, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tstz } from "./columns";

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: tstz("at").notNull().defaultNow(),

    service: text("service").notNull(),

    company: text("company"),

    feature: text("feature").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),

    totalTokens: integer("total_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    ok: boolean("ok").notNull().default(true),
    error: text("error"),

    requestId: text("request_id"),
  },
  (t) => [
    index("ai_usage_at_idx").on(t.at),
    index("ai_usage_company_idx").on(t.company, t.at),
    uniqueIndex("ai_usage_request_uq").on(t.service, t.requestId),
    check("ai_usage_tokens_nonneg", sql`${t.promptTokens} >= 0 AND ${t.completionTokens} >= 0 AND ${t.totalTokens} >= 0`),
  ],
);
