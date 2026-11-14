import { createDb } from "@listed/db";
import { NearRpc } from "@listed/db/near";
import { Redis } from "ioredis";
import { pino } from "pino";
import { loadConfig } from "./config";
import { FundsFollower } from "./funds/follower";
import { startHealthServer } from "./health";

const log = pino({ name: "indexer", level: process.env.LOG_LEVEL ?? "info" });

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { db, close } = createDb({ appName: "listed-indexer", max: 5 });
  const rpc = new NearRpc(cfg.rpcUrl, { timeoutMs: 20_000, retries: 2 });
  const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
  redis.on("error", (err) => log.warn({ err: err.message }, "redis error"));

  const fundsFollower = new FundsFollower({ db, rpc, redis, log: log.child({ part: "funds" }), network: cfg.network });
  const health = startHealthServer(cfg.healthPort, () => ({ ...fundsFollower.status, funds: fundsFollower.status }), cfg.healthHost);
  log.info({ rpc: cfg.rpcUrl, network: cfg.network, port: cfg.healthPort }, "indexer starting");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    fundsFollower.stop();
    health.close();
    redis.disconnect();
    await close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await fundsFollower.run();
}

main().catch((err: unknown) => {
  log.fatal({ err: err instanceof Error ? err.stack : String(err) }, "indexer crashed");
  process.exit(1);
});
