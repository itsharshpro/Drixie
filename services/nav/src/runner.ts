import { brainBill, fundScore, pricesHash, rankFunds, roundPrices, returnsBetween, coinsToNum, microToUsd } from "@listed/fundmath";
import { FUND_STREAM_CHANNEL, type BellStreamEvent } from "@listed/shared";
import { FundsChain, type ChainClock, type ChainConfig, type ChainFund } from "./chain";
import { readDeployment, type FundsDeployment, type NavConfig } from "./config";
import { Keeper } from "./keeper";
import { computeNavs, snapshotOf } from "./engine";
import {
  activeSwans,
  aiCostByFund,
  applyStartupEvent,
  getBell,
  insertBlackSwan,
  loadSnapshots,
  markBell,
  markSwanApplied,
  readPrices,
  recordQuarterCall,
  saveBellSnapshot,
  saveFundBells,
  saveSnapshots,
  spyAt,
  swanForQuarter,
  type Sql,
} from "./store";
import { BLACK_SWAN_INFO, rollBlackSwan, swanSeed } from "./swans";

export interface Log {
  info(o: object, m: string): void;
  warn(o: object, m: string): void;
  error(o: object, m: string): void;
}

export interface Publisher {
  publish(channel: string, message: string): Promise<unknown>;
}

export interface RunnerStatus {
  mode: "contract" | "epoch";
  clock: string | null;
  contract: string | null;
  deploymentFile: string;
  postEnabled: boolean;
  lastTickAt: string | null;
  lastError: string | null;
  bell: number | null;
  nextBellAt: string | null;
  lastSnapshot: { bell: number; at: string; pricesHash: string; assets: number; missing: string[] } | null;
  lastPost: { bell: number; at: string; txHash: string | null; funds: number; skipped: string[]; filled: number | null } | null;
  lastPostError: string | null;
  lastQuarterClosed: number | null;
  lastSeasonSettled: number | null;
  quarter: number | null;
  season: number | null;
}

interface ContractCtx {
  chain: FundsChain;
  config: ChainConfig;
  clock: ChainClock;
  clockId: string;
}

export class NavRunner {
  readonly status: RunnerStatus;
  private dep: FundsDeployment | null = null;
  private depKey = "";
  private chain: FundsChain | null = null;
  private config: ChainConfig | null = null;
  private announcedBell = -1;
  private busy = false;

  constructor(
    private readonly cfg: NavConfig,
    private readonly sql: Sql,
    private readonly log: Log,
    private readonly redis: Publisher | null,
  ) {
    this.status = {
      mode: "epoch",
      clock: null,
      contract: null,
      deploymentFile: cfg.deploymentFile,
      postEnabled: cfg.postEnabled,
      lastTickAt: null,
      lastError: null,
      bell: null,
      nextBellAt: null,
      lastSnapshot: null,
      lastPost: null,
      lastPostError: null,
      lastQuarterClosed: null,
      lastSeasonSettled: null,
      quarter: null,
      season: null,
    };
  }

  async tick(now = Date.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.status.lastTickAt = new Date(now).toISOString();
      const ctx = await this.contract();
      if (ctx) await this.contractTick(ctx, now);
      else await this.epochTick(now);
      this.status.lastError = null;
    } catch (err) {
      this.status.lastError = err instanceof Error ? err.message : String(err);
      this.log.warn({ err: this.status.lastError }, "nav tick failed; retrying next tick");
    } finally {
      this.busy = false;
    }
  }

  private async contract(): Promise<ContractCtx | null> {
    const dep = readDeployment(this.cfg.deploymentFile);
    const key = dep ? JSON.stringify(dep) : "";
    if (key !== this.depKey) {
      this.depKey = key;
      this.dep = dep;
      this.chain = dep ? new FundsChain(dep, this.cfg.network, this.cfg.rpcUrl) : null;
      this.config = null;
      this.announcedBell = -1;
      if (dep) this.log.info({ contract: dep.contract, operator: dep.operator }, "funds deployment found; NAV posting follows the contract clock");
    }
    if (!this.chain || !this.dep) {
      this.status.mode = "epoch";
      this.status.contract = null;
      return null;
    }
    if (!this.config) this.config = await this.chain.config();
    const clock = await this.chain.clock();
    const clockId = `${this.dep.contract}@${this.config.genesisMs}`;
    this.status.mode = "contract";
    this.status.contract = this.dep.contract;
    this.status.clock = clockId;
    return { chain: this.chain, config: this.config, clock, clockId };
  }

  private async epochTick(now: number): Promise<void> {
    const secs = this.cfg.fallbackBellSecs;
    const bell = Math.floor(now / (secs * 1000));
    const bellAt = bell * secs * 1000;
    const clockId = `epoch@${secs}`;
    this.status.clock = clockId;
    this.status.bell = bell;
    this.status.nextBellAt = new Date(bellAt + secs * 1000).toISOString();
    this.status.quarter = null;
    this.status.season = null;
    if (now >= bellAt + this.cfg.snapshotDelaySecs * 1000) await this.snapshot(clockId, bell, bellAt);
  }

  private async contractTick(ctx: ContractCtx, now: number): Promise<void> {
    const { clock, config, clockId } = ctx;
    this.status.bell = clock.bell;
    this.status.nextBellAt = new Date(clock.nextBellAtMs).toISOString();
    this.status.quarter = clock.quarter;
    this.status.season = clock.season;
    this.status.lastQuarterClosed = clock.lastClosedQuarter;
    this.status.lastSeasonSettled = clock.lastSettledSeason;
    if (clock.nowMs < config.genesisMs) return;

    await this.announce(clock);
    const snapDue = clock.bellAtMs + this.cfg.snapshotDelaySecs * 1000;
    if (now >= snapDue) {
      const snap = await this.snapshot(clockId, clock.bell, clock.bellAtMs);
      const bpq = Math.max(1, Math.round(config.quarterSecs / config.bellSecs));
      if (snap && clock.bell % bpq === 0) await this.rollSwan(clockId, clock, snap.pricesHash, config);
    }
    const postDue = clock.revealClosesAtMs + this.cfg.postGraceSecs * 1000;
    if (this.cfg.postEnabled && now >= postDue && (clock.lastNavBell === null || clock.lastNavBell < clock.bell)) {
      await this.post(ctx);
    }
    if (this.cfg.postEnabled) {
      await this.closeQuarters(ctx);
      await this.keep(ctx);
    }
  }

  private lastKeep = 0;
  private async keep(ctx: ContractCtx): Promise<void> {
    if (Date.now() - this.lastKeep < 30_000) return;
    this.lastKeep = Date.now();
    const clock = await ctx.chain.clock();
    const funds = await ctx.chain.funds();
    await new Keeper(ctx.chain, this.sql, this.log, this.cfg.network, ctx.clockId).run(clock, funds);
  }

  private async announce(clock: ChainClock): Promise<void> {
    if (clock.bell <= this.announcedBell || !this.redis) return;
    this.announcedBell = clock.bell;
    const ev: BellStreamEvent = {
      topic: "bell",
      bell: clock.bell,
      at: new Date(clock.bellAtMs).toISOString(),
      nextBellAt: new Date(clock.nextBellAtMs).toISOString(),
      season: clock.season,
      quarter: clock.quarter,
    };
    await this.redis.publish(FUND_STREAM_CHANNEL, JSON.stringify(ev)).catch((err: unknown) => {
      this.log.warn({ err: err instanceof Error ? err.message : String(err) }, "redis publish failed (bell)");
    });
  }

  private async snapshot(clockId: string, bell: number, bellAtMs: number): Promise<{ pricesHash: string; prices: Record<string, number> } | null> {
    const existing = await getBell(this.sql, clockId, bell);
    if (existing) {
      if (!this.status.lastSnapshot || this.status.lastSnapshot.bell !== bell) {
        this.status.lastSnapshot = { bell, at: existing.bellAt, pricesHash: existing.pricesHash, assets: Object.keys(existing.prices).length, missing: existing.missing };
      }
      return existing;
    }

    const snap = await readPrices(this.sql, new Date(bellAtMs));
    if (Object.keys(snap.prices).length === 0) {
      this.log.warn({ bell }, "no prices yet (is the world service running?); snapshot skipped");
      return null;
    }
    const prices = roundPrices(snap.prices);
    const hash = pricesHash(bell, prices);
    await saveBellSnapshot(this.sql, clockId, bell, new Date(bellAtMs), hash, { ...snap, prices });
    this.status.lastSnapshot = { bell, at: new Date(bellAtMs).toISOString(), pricesHash: hash, assets: Object.keys(prices).length, missing: snap.missing };
    this.log.info({ bell, assets: Object.keys(prices).length, missing: snap.missing.length, pricesHash: hash }, "bell price snapshot");
    return { pricesHash: hash, prices };
  }

  private async rollSwan(clockId: string, clock: ChainClock, pricesHashHex: string, config: ChainConfig): Promise<void> {
    if (await swanForQuarter(this.sql, clockId, clock.quarter)) return;
    const seed = swanSeed(clockId, clock.quarter, pricesHashHex);
    const kind = rollBlackSwan(seed, this.cfg.blackSwanChanceBps);
    if (!kind) return;
    const startsAt = new Date(clock.bellAtMs);
    const endsAt = new Date(config.genesisMs + (clock.quarter + 1) * config.quarterSecs * 1000);
    const row = await insertBlackSwan(this.sql, { clock: clockId, quarter: clock.quarter, kind, startsAt, endsAt, seed });
    if (!row) return;
    this.log.info({ kind, quarter: clock.quarter, seed }, `black-swan day: ${BLACK_SWAN_INFO[kind].title}`);
    if (kind === "startup_winter") {
      try {
        const marks = await applyStartupEvent(this.sql, startsAt.toISOString().slice(0, 10), -800, `swan:${row.id}`);
        await markSwanApplied(this.sql, row.id, { startupMarks: marks });
      } catch (err) {
        this.log.warn({ err: err instanceof Error ? err.message : String(err) }, "could not apply startup winter to marks");
      }
    }
  }

  private async post(ctx: ContractCtx): Promise<void> {
    const { chain, config, clock, clockId } = ctx;
    const bell = clock.bell;
    const snap = await getBell(this.sql, clockId, bell);
    if (!snap) return; // wait for prices
    if (snap.status === "posted") return;
    const prevBell = clock.lastNavBell;
    const prevSnap = prevBell === null ? null : await getBell(this.sql, clockId, prevBell);
    const returns = prevSnap ? returnsBetween(prevSnap.prices, snap.prices) : {};
    const funds = await chain.funds();
    const ids = funds.map((f) => f.id);
    const windowStart = new Date(prevBell === null ? clock.bellAtMs - config.bellSecs * 1000 : config.genesisMs + prevBell * config.bellSecs * 1000);
    const windowEnd = new Date(clock.bellAtMs);
    const costs = await aiCostByFund(this.sql, ids, windowStart, windowEnd).catch(() => ({}) as Record<string, number>);
    const crunch = (await activeSwans(this.sql, windowEnd)).some((s) => s.kind === "compute_crunch" && s.clock === clockId);
    const brainBills = Object.fromEntries(ids.map((id) => [id, brainBill((costs as Record<string, number>)[id] ?? 0, this.cfg.computeMultiplier, crunch)]));
    const snapshots = await loadSnapshots(this.sql, clockId);
    const { rows, results } = computeNavs({
      bell,
      funds,
      snapshots,
      returns,
      brainBills,
      gameUsdPerNear: config.gameUsdPerNear,
      bellSecs: config.bellSecs,
      quarterSecs: config.quarterSecs,
      bellsElapsed: prevBell === null ? 1 : Math.max(1, bell - prevBell),
    });
    await saveFundBells(
      this.sql,
      clockId,
      bell,
      results.map((r) => ({
        fund: r.fund,
        valuePrev: r.valuePrev,
        portfolioReturn: r.step.portfolioReturn,
        crossPrev: r.crossPrev,
        crossNow: r.crossNow,
        crossFlow: r.crossFlow,
        turnoverBps: r.turnoverBps,
        tradingCost: r.step.tradingCost,
        brainBill: r.step.brainBill,
        mgmtFee: r.step.mgmtFee,
        value: r.step.value,
        nav: microToUsd(r.navMicro),
        valueMicro: r.valueMicro.toString(),
        navMicro: r.navMicro.toString(),
        missing: r.step.missing,
        skipped: r.skipped,
      })),
    );
    const skipped = results.filter((r) => r.skipped).map((r) => `${r.fund}: ${r.skipped}`);
    if (rows.length === 0) {
      await markBell(this.sql, clockId, bell, { status: "skipped", error: skipped.join("; ") || "no active funds" });
      this.status.lastPostError = skipped.join("; ") || "no active funds";
      return;
    }
    try {
      const res = await chain.postNav(bell, snap.pricesHash, rows);
      await markBell(this.sql, clockId, bell, { status: "posted", txHash: res.txHash, filled: res.filled });
      this.status.lastPost = { bell, at: new Date().toISOString(), txHash: res.txHash, funds: rows.length, skipped, filled: res.filled };
      this.status.lastPostError = null;
      this.log.info({ bell, funds: rows.length, filled: res.filled, txHash: res.txHash, skipped }, "NAV posted");

      await this.saveState(chain, clockId, bell);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/after the last posted bell/i.test(msg)) {

        this.log.warn({ bell }, "bell already posted on-chain by another caller");
        return;
      }
      await markBell(this.sql, clockId, bell, { status: "failed", error: msg.slice(0, 500) });
      this.status.lastPostError = msg;
      this.log.error({ bell, err: msg }, "NAV post failed");
    }
  }

  private async saveState(chain: FundsChain, clockId: string, bell: number): Promise<void> {
    const after = await chain.funds();
    await saveSnapshots(
      this.sql,
      clockId,
      after.map((f) => snapshotOf(f, bell)),
      after.map((f) => f.id),
    );
  }

  private async closeQuarters(ctx: ContractCtx): Promise<void> {
    const { chain, config, clock, clockId } = ctx;

    const bpq = Math.max(1, Math.round(config.quarterSecs / config.bellSecs));

    const funds0 = clock.lastClosedQuarter === null || clock.lastSettledSeason === null ? await chain.funds() : [];
    const created = funds0.map((f) => f.createdAtMs).filter((t) => t > 0);
    const firstQuarter = created.length ? Math.max(0, Math.floor((Math.min(...created) - config.genesisMs) / (config.quarterSecs * 1000))) : clock.quarter;
    let next = clock.lastClosedQuarter === null ? firstQuarter : clock.lastClosedQuarter + 1;
    for (; next < clock.quarter; next++) {
      const lastBell = (next + 1) * bpq;
      if (clock.lastNavBell === null || clock.lastNavBell < Math.min(lastBell, clock.bell)) return; // post first
      const start = new Date(config.genesisMs + next * config.quarterSecs * 1000);
      const end = new Date(config.genesisMs + (next + 1) * config.quarterSecs * 1000);
      const [s0, s1] = await Promise.all([spyAt(this.sql, start), spyAt(this.sql, end)]);
      const spyBps = s0 && s1 ? Math.round((s1 / s0 - 1) * 10_000) : null;
      try {
        const res = await chain.closeQuarter(next, spyBps);
        await recordQuarterCall(this.sql, clockId, "quarter", next, "closed", { spyReturnBps: spyBps, spyStart: s0, spyEnd: s1 }, res.txHash, null);
        this.status.lastQuarterClosed = next;
        this.log.info({ quarter: next, spyReturnBps: spyBps, txHash: res.txHash }, "quarter closed");
        await this.saveState(chain, clockId, clock.lastNavBell ?? clock.bell);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await recordQuarterCall(this.sql, clockId, "quarter", next, "failed", { spyReturnBps: spyBps }, null, msg.slice(0, 500));
        this.log.error({ quarter: next, err: msg }, "close_quarter failed");
        return;
      }
    }

    const closed = this.status.lastQuarterClosed ?? clock.lastClosedQuarter;
    if (closed === null) return;
    let season = clock.lastSettledSeason === null ? Math.floor(firstQuarter / Math.max(1, config.quarters)) : clock.lastSettledSeason + 1;
    for (; (season + 1) * config.quarters - 1 <= closed; season++) {
      const funds = await chain.funds();
      const winner = await this.seasonWinner(funds, config, season);
      try {
        const res = await chain.settleSeason(season, winner);
        await recordQuarterCall(this.sql, clockId, "season", season, "settled", { winner }, res.txHash, null);
        this.status.lastSeasonSettled = season;
        this.log.info({ season, winner, txHash: res.txHash }, "season settled");
        await this.saveState(chain, clockId, clock.lastNavBell ?? clock.bell);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await recordQuarterCall(this.sql, clockId, "season", season, "failed", { winner }, null, msg.slice(0, 500));
        this.log.error({ season, err: msg }, "settle_season failed");
        return;
      }
    }
  }

  private async seasonWinner(funds: ChainFund[], config: ChainConfig, season: number): Promise<string | null> {
    const active = funds.filter((f) => f.active);
    if (active.length === 0) return null;
    const start = new Date(config.genesisMs + season * config.quarters * config.quarterSecs * 1000);
    const end = new Date(start.getTime() + config.quarters * config.quarterSecs * 1000);
    const [s0, s1] = await Promise.all([spyAt(this.sql, start), spyAt(this.sql, end)]);
    const spyPct = s0 && s1 ? (s1 / s0 - 1) * 100 : null;
    const rows = active.map((f) => {
      const navNow = microToUsd(f.nav);
      const navStart = microToUsd(f.navSeasonStart);
      const outside = coinsToNum(f.ledgerSupply) * navNow;
      const s = fundScore({
        retSeasonPct: navStart > 0 ? (navNow / navStart - 1) * 100 : null,
        spySeasonPct: spyPct,
        outsideStartUsd: outside,
        outsideNowUsd: outside,
        reputation: f.reputation,
        promiseKept: null,
      });
      return { id: f.id, score: s.score, reputation: f.reputation };
    });
    return rankFunds(rows)[0]?.id ?? null;
  }
}
