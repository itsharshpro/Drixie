import type { Db } from "@listed/db";
import { UNIVERSE } from "@listed/fundmath";
import type { Sql } from "../funds/schema";
import { recordNewsRound } from "../funds/startups";
import { HttpError } from "../http";
import { llmMissing, llmSettings, type LlmSettings } from "../llm";
import { insertNews, pruneStaleTags, recordTagFailure, saveTag, untaggedNews, type NewsRow } from "../store";
import { fetchGdelt, GDELT_TOPICS } from "./gdelt";
import { dedupe, type NewsItem } from "./normalize";
import { fetchFeeds } from "./rss";
import { TAG_BATCH, tagBatch, type TagInput } from "./tagger";

export const NEWS_CHANNEL = "listed:news";

export const MAX_AGE_HOURS = 72;

export const BACKLOG_HOURS = MAX_AGE_HOURS;

export interface Publisher {
  publish(channel: string, message: string): Promise<unknown>;
}

export interface WireDeps {
  db: Db;
  redis: Publisher | null;
  rssFeeds: string[];
  timeoutMs: number;
  log: { info(o: object, m: string): void; warn(o: object, m: string): void };

  maxAiCallsPerDay: number;
  fetchImpl?: typeof fetch;
  settings?: () => LlmSettings;

  sql?: Sql;
}

export interface NewsWireItem {
  id: number;
  url: string;
  title: string;
  domain: string;
  source: string;
  language: string | null;
  sourceCountry: string | null;
  snippet: string | null;
  publishedAt: string;
  tagStatus: string;
  companies: string[];
  services: string[];
  sentiment: number | null;
  reason: string | null;
}

export function toWire(r: NewsRow): NewsWireItem {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    domain: r.domain,
    source: r.source,
    language: r.language,
    sourceCountry: r.sourceCountry,
    snippet: r.snippet,
    publishedAt: r.publishedAt.toISOString(),
    tagStatus: r.tagStatus,
    companies: r.companies,
    services: r.services,
    sentiment: r.sentiment,
    reason: r.reason,
  };
}

export function freshItems(items: NewsItem[], now = new Date()): NewsItem[] {
  const oldest = now.getTime() - MAX_AGE_HOURS * 3_600_000;
  return items
    .filter((it) => it.publishedAt.getTime() >= oldest)
    .map((it) => (it.publishedAt.getTime() > now.getTime() ? { ...it, publishedAt: now } : it));
}

const aiCalls = { day: "", count: 0 };
function takeAiCall(max: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (aiCalls.day !== day) {
    aiCalls.day = day;
    aiCalls.count = 0;
  }
  if (aiCalls.count >= max) return false;
  aiCalls.count += 1;
  return true;
}

export interface TagSummary {
  state: "ready" | "waiting" | "budget";
  waitingFor?: string;
  tagged: number;
  failedBatches: number;
  tokens: number;
  updated: NewsRow[];
}

export async function tagRows(deps: WireDeps, rows: NewsRow[]): Promise<TagSummary> {
  const settings = (deps.settings ?? llmSettings)();
  const missing = llmMissing(settings);
  const summary: TagSummary = { state: "ready", tagged: 0, failedBatches: 0, tokens: 0, updated: [] };
  if (missing) return { ...summary, state: "waiting", waitingFor: missing };
  if (rows.length === 0) return summary;
  for (let i = 0; i < rows.length; i += TAG_BATCH) {
    if (!takeAiCall(deps.maxAiCallsPerDay)) return { ...summary, state: "budget" };
    const batch = rows.slice(i, i + TAG_BATCH);
    const inputs: TagInput[] = batch.map((r) => ({ id: r.id, title: r.title, snippet: r.snippet, domain: r.domain }));
    try {
      const res = await tagBatch(settings, inputs, { timeoutMs: deps.timeoutMs, fetchImpl: deps.fetchImpl });
      summary.tokens += res.promptTokens + res.completionTokens;
      const missed: number[] = [];
      for (const r of batch) {
        const tag = res.tags.get(r.id);
        if (!tag) {
          missed.push(r.id);
          continue;
        }
        const row = await saveTag(deps.db, r.id, tag, res.taggedBy);
        if (row) {
          summary.updated.push(row);
          summary.tagged += 1;
        }
        if (tag.round && deps.sql) {
          try {
            const added = await recordNewsRound(deps.sql, { ...tag.round, newsId: r.id, url: r.url, domain: r.domain, title: r.title, publishedAt: r.publishedAt });
            if (added) deps.log.info({ asset: tag.round.asset, valuationUsd: tag.round.valuationUsd, url: r.url }, "new startup funding round from the news; mark resets today");
          } catch (err) {
            deps.log.warn({ err: err instanceof Error ? err.message : String(err) }, "could not record a reported funding round");
          }
        }
      }
      await recordTagFailure(deps.db, missed);
    } catch (err) {
      summary.failedBatches += 1;
      deps.log.warn({ err: err instanceof Error ? err.message : String(err), batch: batch.length }, "news tagging batch failed");

      if (err instanceof HttpError) break;

      await recordTagFailure(
        deps.db,
        batch.map((r) => r.id),
      );
    }
  }
  return summary;
}

async function publish(deps: WireDeps, kind: "new" | "tagged", rows: NewsRow[]): Promise<number> {
  if (!deps.redis || rows.length === 0) return 0;
  let n = 0;
  for (const r of rows) {
    try {
      await deps.redis.publish(NEWS_CHANNEL, JSON.stringify({ kind, item: toWire(r) }));
      n += 1;
    } catch (err) {
      deps.log.warn({ err: err instanceof Error ? err.message : String(err) }, "redis publish failed (news kept in Postgres)");
      break;
    }
  }
  return n;
}

let lastGdeltOkAt: number | null = null;

export async function runNewsCycle(deps: WireDeps): Promise<Record<string, unknown>> {
  const now = Date.now();
  const hours = lastGdeltOkAt === null ? 24 : Math.min(MAX_AGE_HOURS, (now - lastGdeltOkAt) / 3_600_000 + 0.5);
  const [gdelt, rss] = await Promise.all([
    fetchGdelt({ hours, timeoutMs: deps.timeoutMs, fetchImpl: deps.fetchImpl }),
    fetchFeeds(deps.rssFeeds, { timeoutMs: deps.timeoutMs, fetchImpl: deps.fetchImpl }),
  ]);
  const items = freshItems(dedupe([...gdelt.items, ...rss.items]));
  const inserted = await insertNews(deps.db, items);

  if (gdelt.topicsOk.length === GDELT_TOPICS.length) lastGdeltOkAt = now;

  const backlog = await untaggedNews(deps.db, { sinceHours: BACKLOG_HOURS, limit: 120 });
  const insertedIds = new Set(inserted.map((r) => r.id));
  const tag = await tagRows(deps, backlog);
  const taggedById = new Map(tag.updated.map((r) => [r.id, r]));
  const newRows = inserted.map((r) => taggedById.get(r.id) ?? r);
  const retagged = tag.updated.filter((r) => !insertedIds.has(r.id));
  const published = (await publish(deps, "new", newRows)) + (await publish(deps, "tagged", retagged));

  const pruned = await pruneStaleTags(deps.db, UNIVERSE.map((a) => a.id));
  if (pruned > 0) deps.log.info({ pruned }, "removed ids outside the funds universe from stored news tags");

  const errors = [...gdelt.errors, ...rss.errors];
  for (const e of errors) deps.log.warn({ err: e }, "news source error");
  return {
    fetched: { gdelt: gdelt.items.length, rss: rss.items.length },
    gdeltTopicsOk: gdelt.topicsOk,
    gdeltRateLimited: gdelt.rateLimited,
    feedsOk: rss.feedsOk.length,
    unique: items.length,
    inserted: inserted.length,
    tagging: tag.state,
    ...(tag.waitingFor ? { waitingFor: tag.waitingFor } : {}),
    tagged: tag.tagged,
    tagFailedBatches: tag.failedBatches,
    aiTokens: tag.tokens,
    published,
    prunedTags: pruned,
    errors: errors.length,
  };
}
