import { loadRootEnv } from "@listed/db";
import { BENCHMARK, UNIVERSE } from "@listed/fundmath";

export const DEFAULT_RSS_FEEDS = [
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
  "https://arstechnica.com/ai/feed/",
];

export function financeFeeds(): string[] {
  const symbols = [...UNIVERSE.filter((a) => a.yahoo).map((a) => a.yahoo as string), BENCHMARK.id];
  const out: string[] = [];
  for (let i = 0; i < symbols.length; i += 10) {
    out.push(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbols.slice(i, i + 10).map(encodeURIComponent).join(",")}&region=US&lang=en-US`);
  }
  return out;
}

export const STARTUP_NEWS_QUERIES: Readonly<Record<string, string>> = {
  stripe: '"Stripe" payments',
  databricks: '"Databricks"',
  revolut: '"Revolut"',
  canva: '"Canva"',
  zepto: '"Zepto" quick commerce',
  razorpay: '"Razorpay"',
  perplexity: '"Perplexity AI" OR "Perplexity" startup',
};

export function startupFeeds(): string[] {
  return Object.values(STARTUP_NEWS_QUERIES).map(
    (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=en-US&gl=US&ceid=US:en`,
  );
}

export interface WorldConfig {
  network: string;
  redisUrl: string;
  host: string;
  port: number;
  newsIntervalMs: number;

  pricesIntervalMs: number;

  dailyIntervalMs: number;
  rssFeeds: string[];

  httpTimeoutMs: number;
}

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

const num = (k: string, fallback: number, min: number): number => {
  const raw = env(k);
  const n = raw === undefined ? fallback : Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
};

export function loadConfig(): WorldConfig {
  loadRootEnv();
  const network = env("NEAR_NETWORK") ?? "sandbox";
  const feedsEnv = process.env.WORLD_RSS_FEEDS;
  const rssFeeds =
    feedsEnv === undefined
      ? [...DEFAULT_RSS_FEEDS]
      : feedsEnv
          .split(",")
          .map((s) => s.trim())
          .filter((s) => /^https?:\/\//.test(s));

  if (!/^(0|false|no)$/i.test(env("WORLD_FINANCE_FEEDS") ?? "")) rssFeeds.push(...financeFeeds().filter((f) => !rssFeeds.includes(f)));

  if (!/^(0|false|no)$/i.test(env("WORLD_STARTUP_FEEDS") ?? "")) rssFeeds.push(...startupFeeds().filter((f) => !rssFeeds.includes(f)));
  return {
    network,
    redisUrl: env("REDIS_URL") ?? "redis://127.0.0.1:56380",
    host: env("WORLD_HOST") ?? (network === "sandbox" ? "127.0.0.1" : "0.0.0.0"),
    port: num("WORLD_PORT", 4500, 1),
    newsIntervalMs: num("WORLD_NEWS_INTERVAL_MS", 30 * 60_000, 60_000),
    pricesIntervalMs: num("WORLD_PRICES_INTERVAL_MS", 5 * 60_000, 60_000),
    dailyIntervalMs: num("WORLD_DAILY_INTERVAL_MS", 6 * 3_600_000, 60_000),
    rssFeeds,
    httpTimeoutMs: num("WORLD_HTTP_TIMEOUT_MS", 20_000, 1_000),
  };
}
