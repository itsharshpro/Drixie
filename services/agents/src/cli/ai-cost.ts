import { join } from "node:path";
import { loadEnv } from "../config/env.js";
import { dataDir } from "../config/paths.js";
import { AiUsageLedger, usageReport, type AiUsageRow } from "../llm/usage.js";

const args = process.argv.slice(2);
const daysArg = args.indexOf("--days");
const days = Math.min(90, Math.max(1, Number.parseInt(daysArg >= 0 ? (args[daysArg + 1] ?? "1") : "1", 10) || 1));
const env = loadEnv();
const ledger = new AiUsageLedger(join(dataDir(), "agents", "ai-usage", env.NEAR_NETWORK));
const wanted = ledger.days().slice(-days);
const rows: AiUsageRow[] = wanted.flatMap((d) => ledger.read(d));
const report = usageReport(rows);
const budget = Number(env.AI_DAILY_BUDGET_USD);

if (args.includes("--json")) {
  process.stdout.write(`${JSON.stringify({ days: wanted, dailyBudgetUsd: budget, ...report }, null, 2)}\n`);
} else {
  const byKey = new Map<string, { calls: number; tokens: number; usd: number }>();
  for (const r of rows) {
    const k = `${r.day}  ${(r.company ?? "-").padEnd(7)} ${r.feature.padEnd(14)} ${r.tier.padEnd(8)}`;
    const a = byKey.get(k) ?? { calls: 0, tokens: 0, usd: 0 };
    a.calls++;
    a.tokens += r.totalTokens;
    a.usd += r.costUsd;
    byKey.set(k, a);
  }
  console.log(`AI usage (${env.NEAR_NETWORK}), ${wanted.length ? `${wanted[0]} … ${wanted.at(-1)}` : "no data yet"}; daily budget $${budget}`);
  console.log(`${"day".padEnd(10)}  ${"company".padEnd(7)} ${"feature".padEnd(14)} ${"tier".padEnd(8)} ${"calls".padStart(6)} ${"tokens".padStart(10)} ${"usd".padStart(10)}`);
  for (const [k, v] of [...byKey].sort()) console.log(`${k} ${String(v.calls).padStart(6)} ${String(v.tokens).padStart(10)} ${v.usd.toFixed(4).padStart(10)}`);
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.costUsd);
  for (const [d, usd] of perDay) console.log(`total ${d}: $${usd.toFixed(4)}${budget > 0 ? ` of $${budget} (${((usd / budget) * 100).toFixed(1)}%)` : ""}`);
  console.log(`calls: ${report.calls}, estimated cost: $${report.totalUsd.toFixed(4)}`);
}
