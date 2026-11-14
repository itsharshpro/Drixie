import { dz, worldNews, worldPrices, type Db } from "@listed/db";
import type { NewsItem } from "./news/normalize";
import type { Tag } from "./news/tagger";
import type { DailyBar } from "./pulse/bars";

const { and, desc, eq, gte, inArray, lt, sql } = dz;

export type NewsRow = typeof worldNews.$inferSelect;

export const MAX_TAG_ATTEMPTS = 3;

export async function insertNews(db: Db, items: NewsItem[]): Promise<NewsRow[]> {
  if (items.length === 0) return [];
  const rows: NewsRow[] = [];
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200).map((it) => ({
      url: it.url,
      title: it.title,
      domain: it.domain,
      source: it.source,
      language: it.language,
      sourceCountry: it.sourceCountry,
      snippet: it.snippet,
      publishedAt: it.publishedAt,
    }));
    rows.push(...(await db.insert(worldNews).values(chunk).onConflictDoNothing({ target: worldNews.url }).returning()));
  }
  return rows;
}

export async function untaggedNews(db: Db, opts: { sinceHours: number; limit: number }): Promise<NewsRow[]> {
  const since = new Date(Date.now() - opts.sinceHours * 3_600_000);
  return db
    .select()
    .from(worldNews)
    .where(and(eq(worldNews.tagStatus, "unscored"), lt(worldNews.tagAttempts, MAX_TAG_ATTEMPTS), gte(worldNews.publishedAt, since)))
    .orderBy(desc(worldNews.publishedAt))
    .limit(opts.limit);
}

export async function saveTag(db: Db, id: number, tag: Tag, taggedBy: string): Promise<NewsRow | undefined> {
  const [row] = await db
    .update(worldNews)
    .set({
      tagStatus: "scored",
      companies: tag.companies,
      sentiment: tag.sentiment,
      reason: tag.reason,
      taggedBy,
      taggedAt: new Date(),
      tagAttempts: sql`${worldNews.tagAttempts} + 1`,
    })
    .where(eq(worldNews.id, id))
    .returning();
  return row;
}

export async function recordTagFailure(db: Db, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(worldNews)
    .set({
      tagAttempts: sql`${worldNews.tagAttempts} + 1`,
      tagStatus: sql`CASE WHEN ${worldNews.tagAttempts} + 1 >= ${MAX_TAG_ATTEMPTS} THEN 'failed' ELSE ${worldNews.tagStatus} END`,
    })
    .where(and(inArray(worldNews.id, ids), eq(worldNews.tagStatus, "unscored")));
}

export async function newsCounts(db: Db): Promise<{ total: number; scored: number; unscored: number; failed: number; latest: Date | null }> {
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      scored: sql<number>`count(*) filter (where ${worldNews.tagStatus} = 'scored')::int`,
      unscored: sql<number>`count(*) filter (where ${worldNews.tagStatus} = 'unscored')::int`,
      failed: sql<number>`count(*) filter (where ${worldNews.tagStatus} = 'failed')::int`,
      latest: sql<string | null>`max(${worldNews.publishedAt})`,
    })
    .from(worldNews);
  return {
    total: r?.total ?? 0,
    scored: r?.scored ?? 0,
    unscored: r?.unscored ?? 0,
    failed: r?.failed ?? 0,
    latest: r?.latest ? new Date(r.latest) : null,
  };
}

export async function pruneStaleTags(db: Db, tickers: readonly string[]): Promise<number> {

  const keepList = [...new Set(tickers.map((t) => t.trim()).filter((t) => /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/.test(t)))];
  if (keepList.length === 0) return 0;
  const keep = sql`ARRAY[${sql.join(keepList.map((t) => sql`${t}`), sql`, `)}]::text[]`;
  const rows = await db
    .update(worldNews)
    .set({ companies: sql`ARRAY(SELECT c FROM unnest(${worldNews.companies}) AS c WHERE c = ANY(${keep}))` })
    .where(sql`NOT (${worldNews.companies} <@ ${keep})`)
    .returning({ id: worldNews.id });
  return rows.length;
}

export async function upsertBars(db: Db, bars: DailyBar[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < bars.length; i += 500) {
    const chunk = bars.slice(i, i + 500);
    if (chunk.length === 0) continue;
    await db
      .insert(worldPrices)
      .values(chunk.map((b) => ({ ...b, fetchedAt: new Date() })))
      .onConflictDoUpdate({
        target: [worldPrices.symbol, worldPrices.date],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
          source: sql`excluded.source`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
    n += chunk.length;
  }
  return n;
}

export async function priceCoverage(db: Db): Promise<Map<string, { rows: number; first: string; last: string }>> {
  const rows = await db
    .select({
      symbol: worldPrices.symbol,
      rows: sql<number>`count(*)::int`,
      first: sql<string>`min(${worldPrices.date})::text`,
      last: sql<string>`max(${worldPrices.date})::text`,
    })
    .from(worldPrices)
    .groupBy(worldPrices.symbol);
  return new Map(rows.map((r) => [r.symbol, { rows: r.rows, first: r.first, last: r.last }]));
}
