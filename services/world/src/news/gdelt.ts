import { fetchText, HttpError } from "../http";
import { domainOf, normalizeLanguage, plainText, type NewsItem } from "./normalize";

export const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

export const GDELT_SPACING_MS = 20_000;

export const GDELT_TOPICS: { name: string; query: string }[] = [
  { name: "chips", query: '(nvidia OR semiconductor OR "AI chips" OR "chip stocks" OR "data center" OR tsmc OR broadcom)' },
  { name: "models", query: '("artificial intelligence" OR "large language model" OR "generative AI" OR openai OR chatbot OR "AI model")' },
  { name: "markets", query: '("AI stocks" OR "tech stocks" OR nasdaq OR "AI bubble" OR "AI spending" OR "stock market" OR "Wall Street" OR "Federal Reserve")' },

  { name: "startups", query: '(Stripe OR Databricks OR Revolut OR Canva OR Zepto OR Razorpay OR "Perplexity AI" OR SpaceX)' },
  { name: "india", query: '(Sensex OR Nifty OR "Reliance Industries" OR Infosys OR "HDFC Bank" OR "ICICI Bank" OR "Bharti Airtel" OR "Tata Consultancy")' },
];

export interface GdeltArticle {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

export function gdeltUrl(query: string, opts: { hours: number; maxRecords?: number }): string {
  const hours = Math.max(1, Math.min(72, Math.ceil(opts.hours)));
  const params = new URLSearchParams({
    query: `${query} sourcelang:english`,
    mode: "ArtList",
    format: "json",
    maxrecords: String(Math.max(1, Math.min(250, opts.maxRecords ?? 75))),
    timespan: `${hours}h`,
    sort: "DateDesc",
  });
  return `${GDELT_ENDPOINT}?${params.toString()}`;
}

export function parseSeenDate(s: string | undefined): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec((s ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  return Number.isFinite(t) ? new Date(t) : null;
}

export function cleanGdeltTitle(title: string): string {
  return title
    .replace(/(\d) , (\d{3})\b/g, "$1,$2")
    .replace(/ ' (s|t|re|ll|ve|d|m)\b/gi, "'$1")
    .replace(/\s+([,.:;?!%)])/g, "$1")
    .replace(/([($])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function lenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {

    const cleaned = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return JSON.parse(cleaned);
  }
}

export class GdeltResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GdeltResponseError";
  }
}

export function parseGdeltArtList(text: string): NewsItem[] {
  const body = text.trim();
  if (!body) return [];
  if (!body.startsWith("{")) throw new GdeltResponseError(`GDELT said: ${body.slice(0, 200).replace(/\s+/g, " ")}`);
  const parsed = lenientJson(body) as { articles?: GdeltArticle[] };
  const articles = Array.isArray(parsed.articles) ? parsed.articles : [];
  const out: NewsItem[] = [];
  for (const a of articles) {
    const url = (a.url ?? "").trim();
    const title = cleanGdeltTitle(plainText(a.title, 300));
    const publishedAt = parseSeenDate(a.seendate);
    if (!url || !title || !publishedAt) continue;
    out.push({
      url,
      title,
      domain: (a.domain ?? "").trim().toLowerCase().replace(/^www\./, "") || domainOf(url),
      source: "gdelt",
      language: normalizeLanguage(a.language),
      sourceCountry: a.sourcecountry?.trim() || null,
      snippet: null,
      publishedAt,
    });
  }
  return out;
}

export interface GdeltFetchResult {
  items: NewsItem[];
  topicsOk: string[];

  rateLimited: boolean;
  errors: string[];
}

let cycle = 0;

export function topicOrder(n: number): typeof GDELT_TOPICS {
  const k = ((n % GDELT_TOPICS.length) + GDELT_TOPICS.length) % GDELT_TOPICS.length;
  return [...GDELT_TOPICS.slice(k), ...GDELT_TOPICS.slice(0, k)];
}

export async function fetchGdelt(opts: { hours: number; timeoutMs: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; cycle?: number }): Promise<GdeltFetchResult> {
  const result: GdeltFetchResult = { items: [], topicsOk: [], rateLimited: false, errors: [] };
  for (const topic of topicOrder(opts.cycle ?? cycle++)) {
    try {
      const res = await fetchText(gdeltUrl(topic.query, { hours: opts.hours }), {
        timeoutMs: opts.timeoutMs,
        retries: 1,
        backoffMs: 10_000,
        minSpacingMs: GDELT_SPACING_MS,
        retryOn429: false,
        headers: { accept: "application/json" },
        fetchImpl: opts.fetchImpl,
        sleep: opts.sleep,
      });
      result.items.push(...parseGdeltArtList(res.text));
      result.topicsOk.push(topic.name);
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        result.rateLimited = true;
        result.errors.push(`gdelt ${topic.name}: rate limited (HTTP 429); skipping the rest of this cycle`);
        break;
      }
      result.errors.push(`gdelt ${topic.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
