import { join } from "node:path";
import { dataDir, env, keysDir, loadChainConfig, nearToYoctoBig, readFundsDeployment } from "@listed/chain";
import { PORTS } from "@listed/shared";
import { createLogger } from "../log";
import { buildServer } from "../server";
import { HouseInvestors, type HouseConfig } from "./house";

const num = (name: string, fallback: number, min = 0): number => {
  const v = Number(env(name));
  return Number.isFinite(v) && v >= min && env(name) !== undefined ? v : fallback;
};

export function houseConfig(): HouseConfig & { port: number; host: string; logFile: string; serviceToken: string | null; enabled: boolean } {
  const chain = loadChainConfig();
  const network = chain.network;
  const sandbox = network === "sandbox";
  const contract = readFundsDeployment(network)?.contract ?? "pending";
  return {
    enabled: !/^(0|false|no|off)$/i.test(env("DESK_ENABLED") ?? "1"),
    network,
    apiUrl: (env("DESK_API_URL") ?? env("API_URL") ?? `http://localhost:${PORTS.api}`).replace(/\/+$/, "").replace(/\/v1$/, ""),
    keysDir: env("DESK_KEYS_DIR") ?? join(keysDir(network), "house"),
    stateFile: env("DESK_STATE_FILE") ?? join(dataDir(), "desk", network, `house-investors.${contract}.json`),
    tickMs: num("DESK_TICK_SECONDS", sandbox ? 60 : 180, 5) * 1000,
    gasFloor: nearToYoctoBig(env("DESK_GAS_FLOOR_NEAR") ?? (sandbox ? "2" : "0.1")),
    sizing: { maxShare: num("DESK_MAX_SHARE_PCT", 8, 0.1) / 100, minUsd: num("DESK_MIN_USD", sandbox ? 25 : 2, 0) },
    actionsPerHour: Math.floor(num("DESK_ACTIONS_PER_HOUR", sandbox ? 60 : 12, 0)),
    slippageBps: Math.floor(num("DESK_SLIPPAGE_BPS", 200, 1)),
    makerPerHour: Math.floor(num("DESK_MAKER_PER_HOUR", sandbox ? 240 : 40, 0)),
    port: Math.floor(num("DESK_PORT", PORTS.desk, 1)),
    host: env("DESK_HOST") ?? (sandbox ? "127.0.0.1" : "0.0.0.0"),
    logFile: env("DESK_LOG_FILE") ?? join(dataDir(), "logs", "desk.log"),
    serviceToken: env("SERVICE_TOKEN") ?? null,
  };
}

export async function runHouseInvestors(): Promise<void> {
  const cfg = houseConfig();
  const log = createLogger(cfg.logFile);
  const house = new HouseInvestors(cfg, log);
  const startedAt = new Date().toISOString();
  log.info({ network: cfg.network, enabled: cfg.enabled, tickMs: cfg.tickMs, actionsPerHour: cfg.actionsPerHour }, "house investors starting");

  const server = buildServer(async () => {
    const s = house.status();
    return {
      ok: true,
      service: "desk",
      mode: "house-investors",
      disclosure: "House investors: disclosed house-* accounts that buy in, cash out and trade fund coins by fixed public rules (FUNDS_SPEC §12).",
      enabled: cfg.enabled,
      network: cfg.network,
      startedAt,
      ...s,
    };
  });
  server.post("/frenzy", async (req, reply) => {
    const auth = String(req.headers.authorization ?? "");
    if (!cfg.serviceToken || auth !== `Bearer ${cfg.serviceToken}`) return reply.code(401).send({ error: { code: "unauthorized", message: "Service token required." } });
    const minutes = Math.max(1, Math.min(24 * 60, Number((req.body as { minutes?: number } | null)?.minutes ?? 15)));
    house.frenzy(minutes);
    log.info({ minutes }, "retail frenzy started");
    return { ok: true, until: new Date(Date.now() + minutes * 60_000).toISOString() };
  });
  await server.listen({ port: cfg.port, host: cfg.host });
  log.info({ url: `http://${cfg.host}:${cfg.port}/health` }, "health server listening");
  if (cfg.enabled) house.start();

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    house.stop();
    await server.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (err) => log.error({ err: err instanceof Error ? err.message : String(err) }, "unhandled rejection (ignored)"));
}
