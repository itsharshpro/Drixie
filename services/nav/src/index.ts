import { createDb } from "@listed/db";
import { Redis } from "ioredis";
import { pino } from "pino";
import { loadConfig } from "./config";
import { startHttp } from "./http";
import { NavRunner } from "./runner";
import { activeSwans, ensureNavSchema, getBell, latestBells, recentSwans } from "./store";
import { BLACK_SWAN_INFO, type BlackSwanKind } from "./swans";

const log = pino({ name: "nav", level: process.env.LOG_LEVEL ?? "info" });
const TICK_MS = 10_000;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { sql, close } = createDb({ appName: "listed-nav", max: 3 });
  await ensureNavSchema(sql);
  const once = process.argv.includes("--once");

  const lockConn = await sql.reserve();
  const [lock] = await lockConn<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(hashtext('drixie_nav_oracle')) AS ok`;
  if (!lock?.ok) {
    log.error({}, "another NAV oracle already runs against this database; exiting (stop it first)");
    lockConn.release();
    await close();
    process.exit(once ? 1 : 0);
  }

  let redis: Redis | null = null;
  try {
    redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    redis.on("error", (err) => log.warn({ err: err.message }, "redis error"));
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "redis unavailable; bell events will not be published");
  }

  const runner = new NavRunner(cfg, sql, log, redis);
  if (once) {
    await runner.tick();
    process.stdout.write(`${JSON.stringify(runner.status, null, 2)}\n`);
    redis?.disconnect();
    lockConn.release();
    await close();
    return;
  }

  const startedAt = new Date().toISOString();
  const withInfo = (s: { kind: string }) => ({ ...s, ...(BLACK_SWAN_INFO[s.kind as BlackSwanKind] ?? {}) });
  const http = startHttp(cfg.port, cfg.host, async (path, query) => {
    if (path === "/" || path === "/health") {
      let dbOk = true;
      try {
        await sql`select 1`;
      } catch {
        dbOk = false;
      }
      const s = runner.status;
      const waitingFor =
        s.mode === "epoch" ? "funds deployment (.data/deployment.funds.<network>.json); snapshots only" : !s.lastSnapshot ? "world prices" : null;
      return {
        status: dbOk ? 200 : 503,
        body: {
          ok: dbOk,
          service: "nav",
          startedAt,
          db: dbOk,
          redis: redis?.status ?? "off",
          waitingFor,
          lastBell: s.lastPost?.bell ?? null,
          ...s,
          computeMultiplier: cfg.computeMultiplier,
        },
      };
    }
    if (path === "/bells") {
      const limit = Math.min(200, Math.max(1, Number(query.get("limit") ?? 20) || 20));
      const rows = await latestBells(sql, query.get("clock") ?? runner.status.clock, limit);
      return { status: 200, body: { items: rows.map(({ prices: _p, ...r }) => r) } };
    }
    const m = /^\/bells\/(\d+)$/.exec(path);
    if (m) {
      const clock = query.get("clock") ?? runner.status.clock;
      const row = clock ? await getBell(sql, clock, Number(m[1])) : null;
      return row ? { status: 200, body: { ...row, canonical: "bell:<n> then <asset>=<micro-USD> lines sorted by id, joined by \\n; sha256 hex" } } : null;
    }
    if (path === "/black-swans") {
      const [active, recent] = await Promise.all([activeSwans(sql, new Date()), recentSwans(sql, 20)]);
      return { status: 200, body: { active: active.map(withInfo), recent: recent.map(withInfo) } };
    }
    return null;
  });
  http.on("error", (err: NodeJS.ErrnoException) => {
    log.error({ err: err.message }, "http server error");
    if (err.code === "EADDRINUSE") process.exit(1);
  });
  log.info({ port: cfg.port, deploymentFile: cfg.deploymentFile, postEnabled: cfg.postEnabled }, "nav oracle starting");

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const loop = async () => {
    if (stopped) return;
    await runner.tick();
    if (!stopped) timer = setTimeout(() => void loop(), TICK_MS);
  };
  timer = setTimeout(() => void loop(), 1_000);

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    stopped = true;
    if (timer) clearTimeout(timer);
    http.close();
    redis?.disconnect();
    lockConn.release();
    await close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (err) => log.error({ err: err instanceof Error ? err.message : String(err) }, "unhandled rejection (ignored)"));
}

main().catch((err: unknown) => {
  log.fatal({ err: err instanceof Error ? err.stack : String(err) }, "nav oracle crashed");
  process.exit(1);
});
