import { impliedValuation, roundResetMark, startupNewsMoveBps, STARTUP_IDS, STARTUP_INDEX_BASE } from "@listed/fundmath";
import type { Sourced } from "@listed/shared";
import type { Sql } from "./schema";

export interface RoundSeed {
  asset: string;
  roundDate: string;
  valuationUsd: number;
  label: string;
  sources: Sourced[];
}

export const STARTUP_SEEDS: readonly RoundSeed[] = [
  {
    asset: "stripe",
    roundDate: "2026-02-24",
    valuationUsd: 159e9,
    label: "Tender offer (secondary sale) led by Thrive Capital, Coatue and a16z",
    sources: [
      { label: "The Block", url: "https://www.theblock.co/news/business/2026-02-24-stripe-valuation-jumps-to-159-billion-on-back-of-tender-offer-391075" },
      { label: "The Irish Times", url: "https://www.irishtimes.com/business/2026/02/24/irish-founded-fintech-stripe-valued-at-159bn" },
    ],
  },
  {
    asset: "databricks",
    roundDate: "2026-07-16",
    valuationUsd: 188e9,
    label: "Strategic funding round led by Coatue",
    sources: [
      { label: "Databricks newsroom", url: "https://www.databricks.com/company/newsroom/press-releases/databricks-raising-strategic-round-funding-188-billion-valuation" },
      { label: "Crowdfund Insider", url: "https://www.crowdfundinsider.com/2026/07/292731-databricks-secures-new-funding-at-188-billion-valuation/" },
    ],
  },
  {
    asset: "revolut",
    roundDate: "2026-11-04",
    valuationUsd: 115e9,
    label: "Secondary share sale",
    sources: [
      { label: "Finance Magnates", url: "https://www.financemagnates.com/fintech/revolut-confirms-115-billion-valuation-after-secondary-share-sale/" },
      { label: "Sifted", url: "https://sifted.eu/articles/revolut-115-valuation-secondary-share-sale/" },
    ],
  },
  {
    asset: "canva",
    roundDate: "2025-08-22",
    valuationUsd: 42e9,
    label: "Employee share sale led by Fidelity",
    sources: [{ label: "Fortune", url: "https://fortune.com/2025/08/22/canva-billionaire-founders-minting-overnight-millionaires-employee-share-sale/" }],
  },
  {
    asset: "zepto",
    roundDate: "2026-07-30",
    valuationUsd: 4.5e9,
    label: "Pre-IPO round of about ₹1,000 crore (IPO paused)",
    sources: [{ label: "YourStory", url: "https://yourstory.com/2026/07/zepto-rs-1000-cr-pre-ipo-round-prepublic-listing-delayed" }],
  },
  {
    asset: "razorpay",
    roundDate: "2021-12-20",
    valuationUsd: 7.5e9,
    label: "Series F, the last private round (IPO approved, not listed yet)",
    sources: [
      { label: "Entrepreneur India", url: "https://india.entrepreneur.com/?p=101238" },
      { label: "Outlook Business", url: "https://www.outlookbusiness.com/corporate/razorpay-ipo-valuation-reset-600-700mn" },
    ],
  },
  {
    asset: "perplexity",
    roundDate: "2025-09-10",
    valuationUsd: 20e9,
    label: "$200M funding round",
    sources: [
      { label: "Revenue Memo", url: "https://www.revenuememo.com/p/perplexity-funding" },
      { label: "DefiLlama", url: "https://defillama.com/pre-ipo/perplexity-ai" },
    ],
  },
];

export const LISTED_STARTUP_SEEDS: readonly RoundSeed[] = [
  {
    asset: "SPCX",
    roundDate: "2026-06-12",
    valuationUsd: 1.77e12,
    label: "Nasdaq IPO at $135 a share (ticker SPCX)",
    sources: [
      { label: "NPR", url: "https://npr.org/2026/06/12/nx-s1-5855004/stock-ai-spacex-ipo-elon-musk" },
      { label: "Built In", url: "https://builtin.com/articles/spacex-ipo-valuation-20260612" },
    ],
  },
];

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number): string => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

export async function seedRounds(sql: Sql): Promise<number> {
  let n = 0;
  for (const s of [...STARTUP_SEEDS, ...LISTED_STARTUP_SEEDS]) {
    const res = await sql`
      INSERT INTO startup_rounds (asset, round_date, valuation_usd, label, sources, is_base, mark_after, detected_by)
      VALUES (${s.asset}, ${s.roundDate}, ${s.valuationUsd}, ${s.label}, ${JSON.stringify(s.sources)}::jsonb, true, ${STARTUP_INDEX_BASE}, 'seed')
      ON CONFLICT ON CONSTRAINT startup_rounds_uq DO NOTHING`;
    n += res.count;
  }
  return n;
}

interface RoundRow {
  id: string;
  asset: string;
  round_date: string;
  valuation_usd: number;
  is_base: boolean;
  mark_after: number;
  applied_on: string | null;
}

async function rounds(sql: Sql, asset: string): Promise<RoundRow[]> {
  return sql<RoundRow[]>`
    SELECT id::text, asset, round_date::text, valuation_usd, is_base, mark_after, applied_on::text
    FROM startup_rounds WHERE asset = ${asset} ORDER BY round_date, id`;
}

async function dayHeadlines(sql: Sql, asset: string, day: string): Promise<{ id: number; sentiment: number }[]> {
  const from = new Date(`${day}T00:00:00Z`);
  const to = new Date(from.getTime() + 86_400_000);
  const rows = await sql<{ id: string; sentiment: number }[]>`
    SELECT id::text, sentiment FROM world_news
    WHERE tag_status = 'scored' AND sentiment IS NOT NULL AND companies @> ARRAY[${asset}]::text[]
      AND published_at >= ${from.toISOString()} AND published_at < ${to.toISOString()}
    ORDER BY id`;
  return rows.map((r) => ({ id: Number(r.id), sentiment: Number(r.sentiment) }));
}

async function lastMarkBefore(sql: Sql, asset: string, day: string): Promise<{ date: string; mark: number } | null> {
  const [r] = await sql<{ date: string; mark: number }[]>`
    SELECT date::text, mark FROM startup_marks WHERE asset = ${asset} AND date < ${day} ORDER BY date DESC LIMIT 1`;
  return r ? { date: r.date, mark: Number(r.mark) } : null;
}

export interface MarkSummary {
  asset: string;
  date: string;
  mark: number;
  newsBps: number;
  headlines: number;
}

async function upsertDay(sql: Sql, asset: string, day: string, rs: RoundRow[]): Promise<MarkSummary | null> {
  const base = rs.find((r) => r.is_base);
  if (!base) return null;
  const resetToday = [...rs].reverse().find((r) => !r.is_base && r.applied_on === day);
  const latestRound = [...rs].reverse().find((r) => r.is_base || (r.applied_on !== null && r.applied_on <= day)) ?? base;
  const prev = resetToday ? Number(resetToday.mark_after) : ((await lastMarkBefore(sql, asset, day))?.mark ?? STARTUP_INDEX_BASE);
  const heads = await dayHeadlines(sql, asset, day);
  const newsBps = startupNewsMoveBps(heads.map((h) => h.sentiment));
  const sentimentSum = heads.reduce((s, h) => s + h.sentiment, 0);
  const baseVal = Number(base.valuation_usd);
  const [row] = await sql<{ mark: number }[]>`
    INSERT INTO startup_marks (asset, date, mark, prev_mark, news_bps, event_bps, sentiment_sum, headlines, base_valuation_usd, valuation_usd, round_id, updated_at)
    VALUES (${asset}, ${day}, GREATEST(0.0001, round((${prev}::float8 * (1 + ${newsBps}::float8 / 10000))::numeric, 4))::float8, ${prev}, ${newsBps}, 0, ${sentimentSum},
      ${`{${heads.map((h) => h.id).join(",")}}`}::bigint[], ${baseVal}, ${impliedValuation(baseVal, prev * (1 + newsBps / 10_000))}, ${Number(latestRound.id)}, now())
    ON CONFLICT (asset, date) DO UPDATE SET
      prev_mark = excluded.prev_mark,
      news_bps = excluded.news_bps,
      sentiment_sum = excluded.sentiment_sum,
      headlines = excluded.headlines,
      base_valuation_usd = excluded.base_valuation_usd,
      round_id = excluded.round_id,
      mark = GREATEST(0.0001, round((excluded.prev_mark * (1 + excluded.news_bps::float8 / 10000) * (1 + startup_marks.event_bps::float8 / 10000))::numeric, 4))::float8,
      valuation_usd = excluded.base_valuation_usd * GREATEST(0.0001, round((excluded.prev_mark * (1 + excluded.news_bps::float8 / 10000) * (1 + startup_marks.event_bps::float8 / 10000))::numeric, 4))::float8 / 100,
      updated_at = now()
    RETURNING mark`;
  return { asset, date: day, mark: Number(row?.mark ?? prev), newsBps, headlines: heads.length };
}

export async function updateStartupMarks(sql: Sql, now: Date = new Date()): Promise<MarkSummary[]> {
  const today = isoDay(now);
  const out: MarkSummary[] = [];
  for (const asset of STARTUP_IDS) {
    const rs = await rounds(sql, asset);
    if (!rs.some((r) => r.is_base)) continue;
    const last = await lastMarkBefore(sql, asset, today);
    let day = last ? addDays(last.date, 1) : today;
    if (day < addDays(today, -7)) day = addDays(today, -7);

    if (last && last.date === addDays(today, -1)) day = last.date;
    for (; day <= today; day = addDays(day, 1)) {
      const s = await upsertDay(sql, asset, day, rs);
      if (s && day === today) out.push(s);
    }
  }
  return out;
}

export function plausibleRound(currentValuationUsd: number | null, newValuationUsd: number, latestRoundUsd: number): boolean {
  if (!(newValuationUsd > 0)) return false;
  if (Math.abs(newValuationUsd / latestRoundUsd - 1) < 0.01) return false;
  const ref = currentValuationUsd && currentValuationUsd > 0 ? currentValuationUsd : latestRoundUsd;
  const ratio = newValuationUsd / ref;
  return ratio >= 0.5 && ratio <= 3;
}

export async function recordNewsRound(
  sql: Sql,
  input: { asset: string; valuationUsd: number; newsId: number; url: string; domain: string; title: string; publishedAt: Date },
  now: Date = new Date(),
): Promise<boolean> {
  if (!STARTUP_IDS.includes(input.asset)) return false;
  const rs = await rounds(sql, input.asset);
  const base = rs.find((r) => r.is_base);
  if (!base) return false;
  const latest = rs.at(-1) ?? base;
  const [cur] = await sql<{ valuation_usd: number | null }[]>`
    SELECT valuation_usd FROM startup_marks WHERE asset = ${input.asset} ORDER BY date DESC LIMIT 1`;
  if (!plausibleRound(cur?.valuation_usd ?? null, input.valuationUsd, Number(latest.valuation_usd))) return false;
  const mark = roundResetMark(Number(base.valuation_usd), input.valuationUsd);
  const sources: Sourced[] = [{ label: input.domain, url: input.url }];
  const res = await sql`
    INSERT INTO startup_rounds (asset, round_date, valuation_usd, label, sources, is_base, mark_after, detected_by, news_id, applied_on)
    VALUES (${input.asset}, ${isoDay(input.publishedAt)}, ${input.valuationUsd}, ${input.title.slice(0, 200)},
      ${JSON.stringify(sources)}::jsonb, false, ${mark}, 'news', ${input.newsId}, ${isoDay(now)})
    ON CONFLICT ON CONSTRAINT startup_rounds_uq DO NOTHING`;
  return res.count > 0;
}

export async function latestStartupMarks(sql: Sql, at: Date = new Date()): Promise<Map<string, { date: string; mark: number; updatedAt: Date }>> {
  const rows = await sql<{ asset: string; date: string; mark: number; updated_at: Date }[]>`
    SELECT DISTINCT ON (asset) asset, date::text, mark, updated_at FROM startup_marks
    WHERE date <= ${isoDay(at)} ORDER BY asset, date DESC`;
  return new Map(rows.map((r) => [r.asset, { date: r.date, mark: Number(r.mark), updatedAt: new Date(r.updated_at) }]));
}
