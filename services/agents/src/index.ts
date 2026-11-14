import { loadEnv } from "./config/env.js";
import { FundRuntime } from "./funds/runtime.js";
import { createLogger } from "./util/log.js";

const log = createLogger("agents");
const env = loadEnv();

const runtime = new FundRuntime(env, log);
runtime.start();

const shutdown = (sig: string) => {
  log.info({ sig }, "shutting down");
  void runtime.stop().finally(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (e) => log.error({ err: String(e) }, "unhandled rejection"));
