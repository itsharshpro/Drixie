import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "pino";
import type { AiPriceTable, PriceKey } from "./ai-prices.js";
import type { Provider } from "./provider.js";
import { JOB_FEATURES, billedTokens, type AiFeature, type ChatRequest, type ChatResult, type Llm } from "./types.js";

export interface AiUsageRow {

  id: string;
  at: string;

  day: string;
  service: "agents";
  company: string | null;
  feature: AiFeature;
  provider: Provider;
  model: string;
  tier: PriceKey;
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  latencyMs: number;
  costUsd: number;
  ok: boolean;
}

export const utcDay = (d = new Date()): string => d.toISOString().slice(0, 10);

export function nextUtcMidnight(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

export class AiPausedError extends Error {
  constructor(
    message: string,
    readonly until: string,
    readonly scope: "all" | "extras",
  ) {
    super(message);
  }
}

export class AiUsageLedger {
  private day = utcDay();
  private spentToday = 0;
  private callsToday = 0;

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    const today = this.read(this.day);
    this.spentToday = today.reduce((s, r) => s + r.costUsd, 0);
    this.callsToday = today.length;
  }

  private file(day: string): string {
    return join(this.dir, `${day}.jsonl`);
  }

  private roll(now = new Date()): void {
    const d = utcDay(now);
    if (d !== this.day) {
      this.day = d;
      this.spentToday = 0;
      this.callsToday = 0;
    }
  }

  append(row: AiUsageRow): void {
    this.roll(new Date(row.at));
    try {
      appendFileSync(this.file(row.day), `${JSON.stringify(row)}\n`);
    } catch {

    }
    if (row.day === this.day) {
      this.spentToday += row.costUsd;
      this.callsToday++;
    }
  }

  today(now = new Date()): { day: string; costUsd: number; calls: number } {
    this.roll(now);
    return { day: this.day, costUsd: this.spentToday, calls: this.callsToday };
  }

  read(day: string): AiUsageRow[] {
    const f = this.file(day);
    if (!existsSync(f)) return [];
    const out: AiUsageRow[] = [];
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as AiUsageRow);
      } catch {

      }
    }
    return out;
  }

  days(): string[] {
    try {
      return readdirSync(this.dir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
        .map((f) => f.slice(0, 10))
        .sort();
    } catch {
      return [];
    }
  }
}

export interface BudgetVerdict {
  allowed: boolean;
  scope?: "all" | "extras";
  reason?: string;
  until?: string;
}

export class AiBudget {
  constructor(
    private readonly ledger: AiUsageLedger,
    readonly dailyUsd: number,
    readonly jobReserveBps: number,
  ) {}

  check(feature: AiFeature, now = new Date()): BudgetVerdict {
    if (!(this.dailyUsd > 0)) return { allowed: true };
    const spent = this.ledger.today(now).costUsd;
    const until = nextUtcMidnight(now).toISOString();
    if (spent >= this.dailyUsd) return { allowed: false, scope: "all", reason: "daily AI budget reached", until };
    const reserve = Math.min(1, Math.max(0, this.jobReserveBps / 10_000));
    if (!JOB_FEATURES.has(feature) && spent >= this.dailyUsd * (1 - reserve)) {
      return { allowed: false, scope: "extras", reason: "daily AI budget reserved for paid jobs", until };
    }
    return { allowed: true };
  }

  paused(now = new Date()): { until: string } | null {
    const v = this.check("job", now);
    return v.allowed ? null : { until: v.until as string };
  }

  status(now = new Date()): { capped: boolean; spentUsd: number; dailyUsd: number; pausedUntil: string | null; extrasPaused: boolean } {
    const spent = this.ledger.today(now).costUsd;
    return {
      capped: this.dailyUsd > 0,
      spentUsd: Number(spent.toFixed(6)),
      dailyUsd: this.dailyUsd,
      pausedUntil: this.paused(now)?.until ?? null,
      extrasPaused: !this.check("letter", now).allowed,
    };
  }
}

export class MeteredLlm implements Llm {
  constructor(
    private readonly inner: Llm,
    private readonly ledger: AiUsageLedger,
    private readonly budget: AiBudget,
    private readonly prices: AiPriceTable,
    private readonly tierOf: (model: string) => PriceKey,
    private readonly provider: Provider,
    private readonly log?: Logger,
    private readonly onRow?: (row: AiUsageRow) => void,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const feature = req.feature ?? "other";
    const verdict = this.budget.check(feature);
    if (!verdict.allowed) throw new AiPausedError(`agents paused: ${verdict.reason}`, verdict.until as string, verdict.scope ?? "all");
    const started = Date.now();
    try {
      const r = await this.inner.chat(req);
      this.record(req, feature, r.model || req.model, r.usage, r.latencyMs ?? Date.now() - started, true);
      return r;
    } catch (e) {
      this.record(req, feature, req.model, { promptTokens: 0, completionTokens: 0 }, Date.now() - started, false);
      throw e;
    }
  }

  private record(req: ChatRequest, feature: AiFeature, model: string, usage: ChatResult["usage"], latencyMs: number, ok: boolean): void {
    const now = new Date();
    const total = billedTokens(usage);
    const tier = this.tierOf(model);
    const row: AiUsageRow = {
      id: randomUUID(),
      at: now.toISOString(),
      day: utcDay(now),
      service: "agents",
      company: req.company ?? null,
      feature,
      provider: this.provider,
      model,
      tier,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      thinkingTokens: usage.thinkingTokens ?? Math.max(0, total - usage.promptTokens - usage.completionTokens),
      totalTokens: total,
      latencyMs,
      costUsd: Number(this.prices.costUsd(model, usage).toFixed(8)),
      ok,
    };
    this.ledger.append(row);
    this.onRow?.(row);

    this.log?.info({ co: row.company, feature, tier, tokens: total, usd: row.costUsd, ms: latencyMs, ok }, "ai call");
  }
}

export class AiUsageForwarder {
  private offsets: Record<string, number> = {};
  private retryAt = 0;
  private busy = false;
  state: { supported: boolean | null; forwarded: number; lastError: string | null; lastOkAt: string | null } = {
    supported: null,
    forwarded: 0,
    lastError: null,
    lastOkAt: null,
  };

  constructor(
    private readonly ledger: AiUsageLedger,
    private readonly url: string,
    private readonly serviceToken: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    try {
      this.offsets = JSON.parse(readFileSync(this.offsetFile(), "utf8")) as Record<string, number>;
    } catch {
      this.offsets = {};
    }
  }

  private offsetFile(): string {
    return join(this.ledger.dir, "forwarded.json");
  }

  async flush(now = Date.now()): Promise<number> {
    if (this.busy || now < this.retryAt || !this.serviceToken) return 0;
    this.busy = true;
    let sent = 0;
    try {
      for (const day of this.ledger.days().slice(-7)) {
        const rows = this.ledger.read(day);
        let from = this.offsets[day] ?? 0;
        while (from < rows.length) {
          const batch = rows.slice(from, from + 200);
          const res = await this.fetchImpl(this.url, {
            method: "POST",
            headers: { "content-type": "application/json", "x-service-token": this.serviceToken },
            body: JSON.stringify({ records: batch.map(toApiRecord) }),
            signal: AbortSignal.timeout(10_000),
          });
          if (res.status === 404) {
            this.state = { ...this.state, supported: false, lastError: "the API has no ai-usage route yet" };
            this.retryAt = now + 5 * 60_000;
            return sent;
          }
          if (!res.ok) {
            this.state = { ...this.state, lastError: `HTTP ${res.status}` };
            this.retryAt = now + 60_000;
            return sent;
          }
          from += batch.length;
          sent += batch.length;
          this.offsets[day] = from;
          this.saveOffsets();
          this.state = { ...this.state, supported: true, forwarded: this.state.forwarded + batch.length, lastError: null, lastOkAt: new Date().toISOString() };
        }
      }
      return sent;
    } catch (e) {
      this.state = { ...this.state, lastError: (e as Error).name === "TimeoutError" ? "timeout" : "API unreachable" };
      this.retryAt = now + 60_000;
      return sent;
    } finally {
      this.busy = false;
    }
  }

  private saveOffsets(): void {
    try {
      writeFileSync(this.offsetFile(), JSON.stringify(this.offsets));
    } catch {

    }
  }
}

export function toApiRecord(r: AiUsageRow) {
  return {
    service: r.service,
    company: r.company,
    feature: r.feature,
    model: r.model,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalTokens: r.totalTokens,
    latencyMs: r.latencyMs,
    costUsd: r.costUsd,
    ok: r.ok,
    requestId: r.id,
    at: r.at,
  };
}

export interface UsageReportRow {
  day: string;
  company: string | null;
  feature: AiFeature;
  model: string;
  calls: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  costUsd: number;
  avgLatencyMs: number;
}

export function usageReport(rows: readonly AiUsageRow[]): { rows: UsageReportRow[]; totalUsd: number; calls: number } {
  const m = new Map<string, UsageReportRow & { latency: number }>();
  for (const r of rows) {
    const k = `${r.day}|${r.company ?? ""}|${r.feature}|${r.model}`;
    const a =
      m.get(k) ??
      ({ day: r.day, company: r.company, feature: r.feature, model: r.model, calls: 0, failed: 0, promptTokens: 0, completionTokens: 0, thinkingTokens: 0, totalTokens: 0, costUsd: 0, avgLatencyMs: 0, latency: 0 } as UsageReportRow & { latency: number });
    a.calls++;
    if (!r.ok) a.failed++;
    a.promptTokens += r.promptTokens;
    a.completionTokens += r.completionTokens;
    a.thinkingTokens += r.thinkingTokens;
    a.totalTokens += r.totalTokens;
    a.costUsd += r.costUsd;
    a.latency += r.latencyMs;
    m.set(k, a);
  }
  const out = [...m.values()].map(({ latency, ...r }) => ({ ...r, costUsd: Number(r.costUsd.toFixed(6)), avgLatencyMs: Math.round(latency / Math.max(1, r.calls)) }));
  out.sort((a, b) => a.day.localeCompare(b.day) || (a.company ?? "").localeCompare(b.company ?? "") || b.costUsd - a.costUsd);
  return { rows: out, totalUsd: Number(out.reduce((s, r) => s + r.costUsd, 0).toFixed(6)), calls: out.reduce((s, r) => s + r.calls, 0) };
}
