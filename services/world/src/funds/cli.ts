import { createDb } from "@listed/db";
import { pino } from "pino";
import { loadConfig } from "../config";
import { runUniverseDaily } from "./daily";
import { runFundPrices } from "./prices-job";
import { ensureFundsWorldSchema } from "./schema";
import { seedRounds } from "./startups";

const log = pino({ name: "world-funds", level: process.env.LOG_LEVEL ?? "warn" });

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { db, sql, close } = createDb({ appName: "listed-world-cli", max: 2 });
  try {
    await ensureFundsWorldSchema(sql);
    const seeded = await seedRounds(sql);
    const prices = await runFundPrices({ sql, timeoutMs: cfg.httpTimeoutMs, log });
    const daily = process.argv.includes("--daily") ? await runUniverseDaily({ db, timeoutMs: cfg.httpTimeoutMs, log }) : null;
    process.stdout.write(`${JSON.stringify({ seeded, prices, daily }, null, 2)}\n`);
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
