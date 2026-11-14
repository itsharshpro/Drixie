import { createDb, loadRootEnv } from "@listed/db";
import { aiCostReport } from "../lib/ai-cost";
import { dailyBudgetUsd } from "../routes/internal";

loadRootEnv();
const args = process.argv.slice(2);
const daysArg = args.indexOf("--days");
const days = Math.min(Math.max(Number(daysArg >= 0 ? args[daysArg + 1] : 7) || 7, 1), 90);
const { db, close } = createDb({ appName: "listed-ai-cost", max: 1 });
const usd = (n: number) => `$${n.toFixed(4)}`;

function table(title: string, rows: { label: string; calls: number; totalTokens: number; costUsd: number }[]): void {
  if (!rows.length) return;
  console.log(`\n${title}`);
  for (const r of rows) console.log(`  ${r.label.padEnd(28)} ${String(r.calls).padStart(6)} calls ${String(r.totalTokens).padStart(10)} tok ${usd(r.costUsd).padStart(10)}`);
}

try {
  const r = await aiCostReport(db, days, dailyBudgetUsd());
  if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`AI usage since ${r.since.slice(0, 10)}: ${r.totals.calls} calls (${r.totals.failed} failed), ${r.totals.totalTokens} tokens, ${usd(r.totals.costUsd)}`);
    const b = r.budget;
    const cap = b.dailyUsd === null ? " (no AI_DAILY_BUDGET_USD set)" : ` of ${usd(b.dailyUsd)}${b.exceeded ? `, budget reached: AI work paused until ${b.resetsAt}` : ""}`;
    console.log(`Today: ${usd(b.todayUsd)}${cap}`);
    table("By day", r.byDay.map((x) => ({ ...x, label: x.day })));
    table("By company", r.byCompany.map((x) => ({ ...x, label: x.company ?? "(none)" })));
    table("By service", r.byService.map((x) => ({ ...x, label: x.service })));
    table("By feature", r.byFeature.map((x) => ({ ...x, label: x.feature })));
    table("By model", r.byModel.map((x) => ({ ...x, label: x.model })));
  }
} finally {
  await close();
}
