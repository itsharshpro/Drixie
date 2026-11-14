import { createDb } from "@listed/db";
import { NearRpc } from "@listed/db/near";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { startCleanup } from "./lib/cleanup";
import { resendMailer } from "./lib/mailer";
import { FundsHub, startFundsBridge } from "./funds/stream";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { db, close } = createDb({ appName: "listed-api" });
  const rpc = new NearRpc(cfg.rpcUrl, { timeoutMs: 5_000, retries: 1 });
  const mailer = cfg.resendApiKey ? resendMailer(cfg.resendApiKey, cfg.emailFrom) : null;
  const fundsHub = new FundsHub();
  const app = await buildApp({ cfg, db, rpc, mailer, fetch, fundsHub }, { logger: { level: process.env.LOG_LEVEL ?? "info", name: "api" } });
  const fundsBridge = startFundsBridge(cfg.redisUrl, fundsHub, app.log);
  const stopCleanup = startCleanup(db, (err) => app.log.warn({ err: err instanceof Error ? err.message : err }, "cleanup failed"));
  if (!mailer) app.log.info("RESEND_API_KEY not set: email sign-in returns 503; passkeys still work");
  if (!cfg.serviceToken) app.log.warn("SERVICE_TOKEN not set: internal routes and account provisioning are disabled");

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    stopCleanup();
    fundsBridge.close();
    await app.close();
    await close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: cfg.host, port: cfg.port });
}

main().catch((err: unknown) => {
  console.error("api failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
