import { aiUsage, dz, type Db } from "@listed/db";
import type { AiBudget } from "@listed/shared";

export interface Price {
  in: number;
  out: number;
}

export const DEFAULT_PRICE: Price = { in: 2.5, out: 15 };

export function parsePriceTable(raw: string | undefined): Record<string, Price> {
  if (!raw?.trim()) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, { in?: unknown; out?: unknown; inPerM?: unknown; outPerM?: unknown }>;
    const out: Record<string, Price> = {};
    for (const [model, p] of Object.entries(obj)) {
      const i = Number(p?.in ?? p?.inPerM);
      const o = Number(p?.out ?? p?.outPerM);
      if (Number.isFinite(i) && i >= 0 && Number.isFinite(o) && o >= 0) out[model] = { in: i, out: o };
    }
    return out;
  } catch {
    return {};
  }
}

export function priceFor(table: Record<string, Price>, model: string): Price {
  return table[model] ?? table.default ?? DEFAULT_PRICE;
}

export function costUsd(price: Price, promptTokens: number, completionTokens: number, totalTokens: number): number {
  const billedOut = Math.max(completionTokens, totalTokens - promptTokens, 0);
  return Math.round(((promptTokens * price.in + billedOut * price.out) / 1_000_000) * 1e8) / 1e8;
}

export interface AiCostReport {
  since: string;
  until: string;
  totals: { calls: number; failed: number; promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number };
  byDay: { day: string; calls: number; totalTokens: number; costUsd: number }[];
  byCompany: { company: string | null; calls: number; totalTokens: number; costUsd: number }[];
  byService: { service: string; calls: number; totalTokens: number; costUsd: number }[];
  byFeature: { feature: string; calls: number; totalTokens: number; costUsd: number }[];
  byModel: { model: string; calls: number; totalTokens: number; costUsd: number; avgLatencyMs: number | null }[];
  budget: AiBudget;
}

export type { AiBudget };

const utcMidnight = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function aiBudget(db: Db, dailyUsd: number | null, now = new Date()): Promise<AiBudget> {
  const start = utcMidnight(now);
  const [row] = await db
    .select({ c: dz.sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float8` })
    .from(aiUsage)
    .where(dz.gte(aiUsage.at, start));
  const today = Math.round((row?.c ?? 0) * 1e6) / 1e6;
  return {
    dailyUsd,
    todayUsd: today,
    remainingUsd: dailyUsd === null ? null : Math.max(0, Math.round((dailyUsd - today) * 1e6) / 1e6),
    exceeded: dailyUsd !== null && today >= dailyUsd,
    resetsAt: new Date(start.getTime() + 86_400_000).toISOString(),
  };
}

type Num = number | string | null;
const n = (v: Num) => Number(v ?? 0);
const usd = (v: Num) => Math.round(n(v) * 1e6) / 1e6;

export async function aiCostReport(db: Db, days: number, dailyUsd: number | null, now = new Date()): Promise<AiCostReport> {
  const since = new Date(utcMidnight(now).getTime() - (Math.max(1, days) - 1) * 86_400_000);
  const where = dz.gte(aiUsage.at, since);
  const agg = {
    calls: dz.sql<number>`count(*)::int`,
    totalTokens: dz.sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::float8`,
    costUsd: dz.sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float8`,
  };
  const [totals, byDay, byCompany, byService, byFeature, byModel, budget] = await Promise.all([
    db
      .select({
        ...agg,
        failed: dz.sql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
        promptTokens: dz.sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::float8`,
        completionTokens: dz.sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::float8`,
      })
      .from(aiUsage)
      .where(where),
    db
      .select({ day: dz.sql<string>`to_char(${aiUsage.at} at time zone 'UTC', 'YYYY-MM-DD')`, ...agg })
      .from(aiUsage)
      .where(where)
      .groupBy(dz.sql`1`)
      .orderBy(dz.sql`1`),
    db.select({ company: aiUsage.company, ...agg }).from(aiUsage).where(where).groupBy(aiUsage.company).orderBy(dz.desc(agg.costUsd)),
    db.select({ service: aiUsage.service, ...agg }).from(aiUsage).where(where).groupBy(aiUsage.service).orderBy(dz.desc(agg.costUsd)),
    db.select({ feature: aiUsage.feature, ...agg }).from(aiUsage).where(where).groupBy(aiUsage.feature).orderBy(dz.desc(agg.costUsd)),
    db
      .select({ model: aiUsage.model, ...agg, avgLatencyMs: dz.sql<number | null>`avg(${aiUsage.latencyMs})::float8` })
      .from(aiUsage)
      .where(where)
      .groupBy(aiUsage.model)
      .orderBy(dz.desc(agg.costUsd)),
    aiBudget(db, dailyUsd, now),
  ]);
  const t = totals[0];
  const row = <T extends { calls: Num; totalTokens: Num; costUsd: Num }>(r: T) => ({ ...r, calls: n(r.calls), totalTokens: n(r.totalTokens), costUsd: usd(r.costUsd) });
  return {
    since: since.toISOString(),
    until: now.toISOString(),
    totals: {
      calls: n(t?.calls ?? 0),
      failed: n(t?.failed ?? 0),
      promptTokens: n(t?.promptTokens ?? 0),
      completionTokens: n(t?.completionTokens ?? 0),
      totalTokens: n(t?.totalTokens ?? 0),
      costUsd: usd(t?.costUsd ?? 0),
    },
    byDay: byDay.map(row),
    byCompany: byCompany.map(row),
    byService: byService.map(row),
    byFeature: byFeature.map(row),
    byModel: byModel.map((r) => ({ ...row(r), avgLatencyMs: r.avgLatencyMs === null ? null : Math.round(n(r.avgLatencyMs)) })),
    budget,
  };
}
