import type { Server } from "node:http";
import { join } from "node:path";
import { UNIVERSE } from "@listed/fundmath";
import { readKey, type KeyFile } from "../config/deployment.js";
import { rereadEnvVar, type Env } from "../config/env.js";
import { dataDir } from "../config/paths.js";
import { AiPriceTable, tierMap, type PriceKey } from "../llm/ai-prices.js";
import { OpenAiLlm } from "../llm/openai-llm.js";
import { providerSettings, type ModelSet, type Provider } from "../llm/provider.js";
import type { Llm } from "../llm/types.js";
import { AiBudget, AiUsageForwarder, AiUsageLedger, MeteredLlm, usageReport, type AiUsageRow } from "../llm/usage.js";
import { NearRpc } from "../near/rpc.js";
import { NearSigner } from "../near/signer.js";
import { errMsg } from "../util/async.js";
import type { Logger } from "../util/log.js";
import { HttpFundsApi, type FundsApi } from "./api.js";
import { ManagerChain, RpcFundsReader, type ChainClock, type FundsReader } from "./chain.js";
import { PendingStore } from "./commit.js";
import { fundsDeploymentPath, readFundsDeployment, readKeyFile, type FundsDeployment } from "./deployment.js";
import { startFundsHttp } from "./http.js";
import { FundJournal } from "./journal.js";
import { FundManager } from "./manager.js";
import { dbPriceSource, type DbPriceSource } from "./db-prices.js";
import { buildSnapshot, type MarketSnapshot } from "./market.js";
import { FUND_IDS, ROSTER, isFundId } from "./roster.js";
import type { UniverseAsset } from "./rules.js";

type AiState = { state: "waiting" | "ready" | "invalid"; reason: string | null };

export interface FundRuntimeOptions {

  api?: FundsApi;
  reader?: FundsReader;
  llm?: Llm;
  keyReader?: (network: string, account: string) => KeyFile | null;
  dataRoot?: string;
}

const FALLBACK_UNIVERSE: UniverseAsset[] = UNIVERSE.map((a) => ({ id: a.id, basket: a.basket, kind: a.kind, region: a.region, name: a.name }));
const NAMES = new Map(UNIVERSE.map((a) => [a.id, a.name]));

export class FundRuntime {
  private readonly startedAt = new Date().toISOString();
  private readonly rpc: NearRpc;
  private readonly api: FundsApi;
  private reader: FundsReader | null;
  private deployment: FundsDeployment | null = null;
  private readonly managers = new Map<string, FundManager>();
  private readonly missingKeys = new Set<string>();
  private clock: ChainClock | null = null;
  private clockAt = 0;
  private clockError: string | null = null;
  private offsetMs = 0;
  private universeMap: Map<string, UniverseAsset> = new Map(FALLBACK_UNIVERSE.map((a) => [a.id, a]));
  private universeSource: "chain" | "fundmath" = "fundmath";
  private universeAt = 0;
  private snapshots = new Map<number, Promise<MarketSnapshot>>();
  private llm: Llm | null = null;
  private aiState: AiState = { state: "waiting", reason: "not checked yet" };
  private models: { provider: Provider; set: ModelSet; keyPresent: boolean; baseUrlSet: boolean };
  private readonly prices: AiPriceTable;
  private readonly ledger: AiUsageLedger;
  private readonly budget: AiBudget;
  private readonly forwarder: AiUsageForwarder;
  private readonly journal: FundJournal;
  private readonly store: PendingStore;
  private readonly multiplier: number;
  private readonly db: DbPriceSource | null;
  private server: Server | null = null;
  private timers: NodeJS.Timeout[] = [];
  private ticking = false;
  private lastNotice = new Map<string, number>();

  constructor(
    private readonly env: Env,
    private readonly log: Logger,
    private readonly opts: FundRuntimeOptions = {},
  ) {
    this.rpc = new NearRpc(env.NEAR_RPC_URL);
    this.api = opts.api ?? new HttpFundsApi(env.API_URL, env.SERVICE_TOKEN);
    this.reader = opts.reader ?? null;
    const root = opts.dataRoot ?? join(dataDir(), "agents");
    this.ledger = new AiUsageLedger(join(root, "ai-usage", env.NEAR_NETWORK));
    const daily = Number(env.AI_DAILY_BUDGET_USD);
    this.budget = new AiBudget(this.ledger, Number.isFinite(daily) ? daily : 5, env.AI_JOB_RESERVE_BPS);
    this.forwarder = new AiUsageForwarder(this.ledger, env.AI_USAGE_URL ?? `${env.API_URL.replace(/\/+$/, "")}/v1/internal/ai-usage`, env.SERVICE_TOKEN);
    this.journal = new FundJournal(join(root, "funds", env.NEAR_NETWORK));
    this.store = new PendingStore(join(root, "funds", env.NEAR_NETWORK, "pending"));
    this.db = env.DATABASE_URL ? dbPriceSource(env.DATABASE_URL) : null;
    const mult = Number(env.COMPUTE_MULTIPLIER);
    this.multiplier = Number.isFinite(mult) && mult > 0 ? mult : 20_000;
    const p = providerSettings(env, () => undefined);
    this.models = { provider: p.provider, set: p.models, keyPresent: Boolean(p.key), baseUrlSet: Boolean(p.baseUrl) };
    this.prices = new AiPriceTable(env.AI_PRICE_TABLE, tierMap(p.models));
    if (opts.llm) {
      this.llm = this.meter(opts.llm, p.provider);
      this.aiState = { state: "ready", reason: null };
    }
  }

  start(): void {
    this.server = startFundsHttp(this.env.AGENTS_PORT, {
      health: () => this.health(),
      funds: () => this.fundsStatus(),
      notes: (fund, limit) => this.journal.recentNotes(fund, limit),
      internalAi: (days) => this.internalAi(days),
      bills: (since, fund) => this.journal.billsSince(since, fund),
      ...(this.env.SERVICE_TOKEN ? { serviceToken: this.env.SERVICE_TOKEN } : {}),
    });
    this.log.info({ port: this.env.AGENTS_PORT, network: this.env.NEAR_NETWORK, multiplier: this.multiplier }, "fund managers up; health on /health, status on /funds");
    if (!this.env.SERVICE_TOKEN) this.log.warn("SERVICE_TOKEN is not set; notes and brain bills stay local (GET /funds/notes)");
    const every = (ms: number, fn: () => Promise<void> | void) => {
      const run = async () => {
        try {
          await fn();
        } catch (e) {
          this.log.error({ err: errMsg(e) }, "fund runtime loop error");
        }
      };
      void run();
      this.timers.push(setInterval(() => void run(), ms));
    };
    every(10_000, () => this.supervise());
    every(this.env.FUND_TICK_MS, () => this.tick());
    every(30_000, async () => {
      await this.forwarder.flush().catch(() => 0);
      await this.journal.flush(this.api).catch(() => undefined);
    });
  }

  async stop(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.forwarder.flush().catch(() => 0);
    await this.journal.flush(this.api).catch(() => undefined);
    await this.db?.close().catch(() => undefined);
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }

  private notice(key: string, msg: string, extra: Record<string, unknown> = {}): void {
    const last = this.lastNotice.get(key) ?? 0;
    if (Date.now() - last < 60_000) return;
    this.lastNotice.set(key, Date.now());
    this.log.info(extra, msg);
  }

  private meter(inner: Llm, provider: Provider): Llm {
    const tiers = tierMap(this.models.set);
    const tierOf = (m: string): PriceKey => tiers.get(m) ?? "default";
    return new MeteredLlm(inner, this.ledger, this.budget, this.prices, tierOf, provider, this.log.child({ part: "ai" }), (row: AiUsageRow) => {
      if (row.company && isFundId(row.company)) this.managers.get(row.company)?.onAiRow(row);
    });
  }

  private ensureAi(): void {
    if (this.llm) return;

    const p = providerSettings(this.env, rereadEnvVar);
    this.models = { provider: p.provider, set: p.models, keyPresent: Boolean(p.key), baseUrlSet: Boolean(p.baseUrl) };
    if (!p.key) {
      this.aiState = { state: "waiting", reason: "no AI key is configured" };
      this.notice("ai", "waiting for the AI key: fund managers hold their portfolios until it is set");
      return;
    }
    if (!p.baseUrl || !p.models.primary) {
      this.aiState = { state: "invalid", reason: p.provider === "ai" ? "AI_BASE_URL and AI_MODEL_PRIMARY must be set" : "LLM_BASE_URL and LLM_MODEL_PRIMARY must be set" };
      this.notice("ai-invalid", this.aiState.reason as string);
      return;
    }
    for (const w of this.prices.warnings) this.notice("prices", w);
    const inner = new OpenAiLlm(p.baseUrl, p.key, this.env.LLM_TIMEOUT_MS, p.provider === "ai" && this.env.AI_THINKING_TOKENS > 0 ? { thinkingTokens: this.env.AI_THINKING_TOKENS } : {});
    this.llm = this.meter(inner, p.provider);
    this.aiState = { state: "ready", reason: null };
    this.log.info({ distinctTiers: new Set([p.models.small, p.models.primary, p.models.best]).size, dailyBudgetUsd: this.budget.dailyUsd }, "AI ready for the fund managers");
  }

  private async supervise(): Promise<void> {
    this.ensureAi();
    if (!this.deployment) {
      this.deployment = readFundsDeployment(this.env.NEAR_NETWORK);
      if (!this.deployment) {
        this.notice("deploy", `waiting for ${fundsDeploymentPath(this.env.NEAR_NETWORK)} (the funds contract is not deployed yet)`);
        return;
      }
      this.reader = this.opts.reader ?? new RpcFundsReader(this.deployment.rpcUrl ? new NearRpc(this.deployment.rpcUrl) : this.rpc, this.deployment.contract);
      this.log.info({ contract: this.deployment.contract, managers: this.deployment.managers }, "funds deployment loaded");
    }
    await this.refreshClock();
    await this.refreshUniverse();
    this.startManagers();
  }

  private async refreshClock(force = false): Promise<void> {
    if (!this.reader || (!force && Date.now() - this.clockAt < 30_000 && this.clock)) return;
    try {
      const [clock, chainNow] = await Promise.all([this.reader.clock(), this.reader.nowMs()]);
      this.clockAt = Date.now();
      if (clock) {
        this.clock = clock;
        this.clockError = null;
      } else {
        this.clockError = "get_config returned no clock";
      }

      this.offsetMs = chainNow - Date.now();
    } catch (e) {
      this.clockError = errMsg(e).slice(0, 200);
      this.notice("clock", "cannot read the funds contract clock yet", { err: this.clockError });
    }
  }

  private async refreshUniverse(): Promise<void> {
    if (!this.reader || Date.now() - this.universeAt < 10 * 60_000) return;
    this.universeAt = Date.now();
    try {
      const u = await this.reader.universe();
      if (u?.length) {
        this.universeMap = new Map(u.map((a) => [a.id, { ...a, name: NAMES.get(a.id) ?? a.id }]));
        this.universeSource = "chain";
      }
    } catch {

    }
  }

  private startManagers(): void {
    if (!this.deployment || !this.reader) return;
    for (const id of FUND_IDS) {
      if (this.managers.has(id)) continue;
      const account = this.deployment.managers[id] as string;
      const keyFile = this.deployment.keyFiles[account];
      const key = this.opts.keyReader
        ? this.opts.keyReader(this.env.NEAR_NETWORK, account)
        : ((keyFile ? readKeyFile(keyFile) : null) ?? readKey(this.env.NEAR_NETWORK, account));
      if (!key) {
        if (!this.missingKeys.has(account)) this.log.warn({ fund: id, account, keyFile: keyFile ?? `.data/keys/${this.env.NEAR_NETWORK}/${account}.json` }, "no key file for the manager");
        this.missingKeys.add(account);
        continue;
      }
      this.missingKeys.delete(account);
      const signer = new NearSigner(account, this.deployment.rpcUrl ?? this.env.NEAR_RPC_URL, key.private_key);
      const m = new FundManager({
        profile: ROSTER[id],
        network: this.env.NEAR_NETWORK,
        reader: this.reader,
        chain: new ManagerChain(id, signer, this.deployment.contract),
        api: this.api,
        llm: () => this.llm,
        models: () => this.models.set,
        prices: this.prices,
        budget: this.budget,
        store: this.store,
        journal: this.journal,
        multiplier: this.multiplier,
        leadSecs: this.env.FUND_DECIDE_LEAD_SECS,
        universe: () => this.universeMap,
        snapshot: (bell) => this.snapshot(bell),
        fundIds: () => [...FUND_IDS],
        log: this.log.child({ part: "fund" }),
        now: () => Date.now() + this.offsetMs,
      });
      this.managers.set(id, m);
      this.log.info({ fund: id, account }, "fund manager started");
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking || !this.clock) return;
    this.ticking = true;
    try {
      for (const m of this.managers.values()) m.tick(this.clock);
    } finally {
      this.ticking = false;
    }
  }

  private snapshot(bell: number): Promise<MarketSnapshot> {
    let s = this.snapshots.get(bell);
    if (!s) {
      const reader = this.reader;
      s = buildSnapshot({ api: this.api, db: this.db, ...(reader ? { chainFunds: () => reader.funds() } : {}) }, [...this.universeMap.values()]);
      this.snapshots.set(bell, s);
      s.catch(() => this.snapshots.delete(bell));
      for (const k of [...this.snapshots.keys()].sort((a, b) => a - b).slice(0, -2)) this.snapshots.delete(k);
    }
    return s;
  }

  private seasonStartMs(): number | null {
    const c = this.clock;
    if (!c) return null;
    const now = Date.now() + this.offsetMs;
    const q = Math.max(0, Math.floor((now - c.seasonStartMs) / (c.quarterSecs * 1000)));
    return c.seasonStartMs + Math.floor(q / c.quarters) * c.quarters * c.quarterSecs * 1000;
  }

  fundsStatus(): Record<string, unknown> {
    const start = this.seasonStartMs();
    return {
      funds: FUND_IDS.map((id) => {
        const m = this.managers.get(id);
        const h = m?.health(start);
        return h
          ? {
              id,
              tier: h.tier,
              autopilot: h.autopilot,
              autopilotReason: h.autopilotReason,
              waiting: h.waiting,
              lastDecisionBell: h.lastDecisionBell,
              lastCommitBell: h.lastCommitBell,
              lastRevealBell: h.lastRevealBell,
              lastAction: h.lastAction,
              lastNote: h.lastNote,
              billSeasonUsd: h.billSeasonUsd,
              counts: { decisions: h.decisions, commits: h.commits, reveals: h.reveals, holds: h.holds, crossTrades: h.crossTrades },
            }
          : { id, tier: null, autopilot: false, waiting: this.deployment ? "manager key missing" : "funds contract not deployed", lastNote: this.journal.recentNotes(id, 1)[0]?.note ?? null };
      }),
    };
  }

  health(): Record<string, unknown> {
    const paused = this.budget.paused();
    const c = this.clock;
    const now = Date.now() + this.offsetMs;
    const nextBell = c ? Math.floor((now - c.seasonStartMs) / (c.bellSecs * 1000)) + 1 : null;
    return {
      ok: true,
      service: "agents",
      mode: "funds",
      ...(this.aiState.state === "waiting" ? { waiting: "AI key" } : !this.deployment ? { waiting: "funds contract" } : {}),
      ...(paused ? { paused: true, pausedUntil: paused.until, message: "Fund managers are on autopilot until the AI budget resets." } : {}),
      network: this.env.NEAR_NETWORK,
      startedAt: this.startedAt,
      deployment: this.deployment ? { contract: this.deployment.contract } : `waiting for ${fundsDeploymentPath(this.env.NEAR_NETWORK)}`,
      ai: { state: paused && this.aiState.state === "ready" ? "paused" : this.aiState.state, reason: paused ? "daily AI budget reached" : this.aiState.reason, keyPresent: this.models.keyPresent },
      clock: c
        ? { bellSecs: c.bellSecs, revealWindowSecs: c.revealWindowSecs, nextBell, nextBellAt: nextBell !== null ? new Date(c.seasonStartMs + nextBell * c.bellSecs * 1000).toISOString() : null }
        : { error: this.clockError ?? "not read yet" },
      universe: { source: this.universeSource, assets: this.universeMap.size },
      brain: { multiplier: this.multiplier },
      reporting: { ...this.journal.state, pending: this.journal.pending, aiUsage: this.forwarder.state },
      managers: this.fundsStatus().funds,
      missingKeys: [...this.missingKeys],
      memory: { rssMb: Math.round(process.memoryUsage().rss / 1048576), heapMb: Math.round(process.memoryUsage().heapUsed / 1048576) },
    };
  }

  internalAi(days: number): Record<string, unknown> {
    const rows = this.ledger
      .days()
      .slice(-days)
      .flatMap((d) => this.ledger.read(d));
    return { provider: this.models.provider, baseUrlSet: this.models.baseUrlSet, models: this.models.set, state: this.aiState, budget: this.budget.status(), forwarding: this.forwarder.state, multiplier: this.multiplier, report: usageReport(rows) };
  }

  async cycle(): Promise<void> {
    await this.supervise();
    await this.refreshClock(true);
    await this.tick();
  }

  manager(id: string): FundManager | undefined {
    return this.managers.get(id);
  }
}
