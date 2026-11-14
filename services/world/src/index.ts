import { createDb } from "@listed/db";
import { Redis } from "ioredis";
import { pino } from "pino";
import { loadConfig } from "./config";
import { startHealthServer } from "./health";
import { llmMissing, llmSettings } from "./llm";
import { runUniverseDaily } from "./funds/daily";
import { runHourlyBars } from "./funds/hourly";
import { runFundPrices } from "./funds/prices-job";
import { ensureFundsWorldSchema } from "./funds/schema";
import { latestStartupMarks, seedRounds } from "./funds/startups";
import { assetPriceCoverage } from "./funds/store";
import { Loop } from "./loop";
import { runNewsCycle } from "./news/wire";
import { newsCounts } from "./store";

const log = pino({ name: "world", level: process.env.LOG_LEVEL ?? "info" });

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const cfg = loadConfig();
  const { db, sql, close } = createDb({ appName: "listed-world", max: 4 });
  await ensureFundsWorldSchema(sql);
  const seeded = await seedRounds(sql);
  if (seeded) log.info({ seeded }, "seeded startup valuation rounds");

  let redis: Redis | null = null;
  try {
    redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false, enableOfflineQueue: false });
    redis.on("error", (err) => log.warn({ err: err.message }, "redis error"));
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "redis unavailable; news will not be published live");
  }

  const maxAiCallsPerDay = Number(process.env.WORLD_AI_MAX_CALLS_PER_DAY ?? 200) || 200;

  const news = new Loop(
    "news",
    cfg.newsIntervalMs,
    () => runNewsCycle({ db, sql, redis, rssFeeds: cfg.rssFeeds, timeoutMs: cfg.httpTimeoutMs, log, maxAiCallsPerDay }),
    log,
  );
  const prices = new Loop("prices", cfg.pricesIntervalMs, () => runFundPrices({ sql, timeoutMs: cfg.httpTimeoutMs, log }), log);
  const hourly = new Loop("hourly", 3_600_000, () => runHourlyBars({ sql, timeoutMs: cfg.httpTimeoutMs, log }), log);
  const daily = new Loop("daily", cfg.dailyIntervalMs, () => runUniverseDaily({ db, timeoutMs: cfg.httpTimeoutMs, log }), log);

  log.info(
    { network: cfg.network, feeds: cfg.rssFeeds.length, port: cfg.port },
    once ? "world service: single run" : "world service starting",
  );

  if (once) {
    await Promise.all([news.runNow(), prices.runNow()]);
    if (process.argv.includes("--daily")) await daily.runNow();
    if (process.argv.includes("--hourly")) await hourly.runNow();
    const out = { prices: prices.status, daily: daily.status, news: news.status, counts: await newsCounts(db) };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    redis?.disconnect();
    await close();
    return;
  }

  const startedAt = new Date().toISOString();
  const health = startHealthServer(cfg.port, cfg.host, async () => {
    let dbOk = true;
    let counts: Awaited<ReturnType<typeof newsCounts>> | null = null;
    let universe: Awaited<ReturnType<typeof assetPriceCoverage>> | null = null;
    let marks: Record<string, { date: string; mark: number }> = {};
    try {
      await sql`select 1`;
      counts = await newsCounts(db);
      universe = await assetPriceCoverage(sql);
      marks = Object.fromEntries([...(await latestStartupMarks(sql))].map(([k, v]) => [k, { date: v.date, mark: v.mark }]));
    } catch {
      dbOk = false;
    }
    const ai = llmSettings();
    const missing = llmMissing(ai);
    return {
      ok: dbOk,
      service: "world",
      startedAt,
      db: dbOk,
      redis: redis?.status ?? "off",
      ai: missing ? { state: "waiting", waitingFor: "AI key or model not configured" } : { state: "ready" },
      prices: { ...prices.status, coverage24h: universe, startupMarks: marks },
      daily: daily.status,
      hourly: hourly.status,
      news: { ...news.status, counts },
    };
  });
  health.on("error", (err) => log.error({ err: err.message }, "health server error"));

  news.start(0);

  prices.start(1_000, { offsetMs: cfg.pricesIntervalMs - 45_000 });
  daily.start(90_000);

  hourly.start(20_000, { offsetMs: 5 * 60_000 });

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    health.close();
    await Promise.all([news.stop(), prices.stop(), daily.stop(), hourly.stop()]);
    redis?.disconnect();
    await close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (err) => log.error({ err: err instanceof Error ? err.message : String(err) }, "unhandled rejection (ignored)"));
}

main().catch((err: unknown) => {
  log.fatal({ err: err instanceof Error ? err.stack : String(err) }, "world service crashed");
  process.exit(1);
});
