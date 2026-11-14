import { randomUUID } from "node:crypto";
import { bellAtMs, bellIndexAt, crossTradeBlock, validateWeights, weightsFromRecord, type SeasonClockConfig } from "@listed/fundmath";
import type { Logger } from "pino";
import type { AiPriceTable } from "../llm/ai-prices.js";
import { modelForTier, type ModelSet, type ModelTier } from "../llm/provider.js";
import type { Llm } from "../llm/types.js";
import type { AiBudget, AiUsageRow } from "../llm/usage.js";
import { AiPausedError } from "../llm/usage.js";
import { errMsg } from "../util/async.js";
import type { FundsApi, ManagerNoteRecord } from "./api.js";
import { autopilotCheck, billUsd, cashFloorBps, estimateNextBill, tierForValue, tierLabel } from "./brain.js";
import type { ChainClock, ChainFund, FundsReader, ManagerChain } from "./chain.js";
import { commitHashFor, newSalt, type PendingCommit, type PendingStore } from "./commit.js";
import { DecisionParseError, parseDecision, type CrossOrder, type Decision, type ThinkMode } from "./decision.js";
import { decisionTemperature, resolveFundDna, thinkEvery, type FundDna } from "./dna.js";
import type { FundJournal } from "./journal.js";
import { biggestMove, type MarketSnapshot } from "./market.js";
import { systemPrompt, userPrompt, type FundState } from "./prompt.js";
import type { FundProfile } from "./roster.js";
import { repairPlan, rulesFrom, turnoverBps, type Plan, type UniverseAsset } from "./rules.js";

export interface ManagerDeps {
  profile: FundProfile;
  network: string;
  reader: FundsReader;
  chain: ManagerChain | null;
  api: FundsApi;
  llm: () => Llm | null;
  models: () => ModelSet;
  prices: AiPriceTable;
  budget: AiBudget;
  store: PendingStore;
  journal: FundJournal;
  multiplier: number;

  leadSecs: number;
  universe: () => ReadonlyMap<string, UniverseAsset>;
  snapshot: (bell: number) => Promise<MarketSnapshot>;
  fundIds: () => string[];
  log: Logger;

  now: () => number;
}

export interface ManagerStatus {
  id: string;
  account: string | null;
  tier: ModelTier | null;
  autopilot: boolean;
  autopilotReason: string | null;
  waiting: string | null;
  lastDecisionBell: number | null;
  lastCommitBell: number | null;
  lastRevealBell: number | null;
  lastAction: string | null;
  lastNote: string | null;
  lastError: string | null;
  billSeasonUsd: number;
  decisions: number;
  commits: number;
  reveals: number;
  holds: number;
  crossTrades: number;
  dnaSource: string | null;
}

const COMMIT_MARGIN_MS = 4_000;
const MIN_THINK_MS = 20_000;
const REVEAL_DELAY_MS = 1_500;

export function toClockConfig(c: ChainClock): SeasonClockConfig {
  return { bellSecs: c.bellSecs, quarterSecs: c.quarterSecs, quarters: c.quarters, seasonStartMs: c.seasonStartMs };
}

export function quarterIndex(c: ChainClock, nowMs: number): { quarter: number; season: number; quarterInSeason: number } {
  const q = Math.max(0, Math.floor((nowMs - c.seasonStartMs) / (c.quarterSecs * 1000)));
  return { quarter: q, season: Math.floor(q / c.quarters), quarterInSeason: q % c.quarters };
}

const samePlan = (a: Plan, b: Plan): boolean => {
  if (a.cashBps !== b.cashBps) return false;
  const ka = Object.entries(a.weights).filter(([, v]) => v > 0);
  const kb = Object.entries(b.weights).filter(([, v]) => v > 0);
  return ka.length === kb.length && ka.every(([k, v]) => b.weights[k] === v);
};

export function styleNudge(current: Plan, snapshot: MarketSnapshot | null, profile: FundProfile, rules: { minHoldingBps: number; maxHoldingBps: number; maxStepBps: number }, name = profile.name): { plan: Plan; note: string } | null {
  const held = Object.entries(current.weights).filter(([, b]) => b > 0);
  if (held.length < 2) return null;
  const score = (id: string): number => {
    const a = snapshot?.assets.find((x) => x.id === id);
    return a?.ret1bell ?? a?.ret1d ?? a?.ret4d ?? 0;
  };
  let from: [string, number];
  let to: [string, number];
  if (profile.moveStyle === "rebalance") {
    const bySize = [...held].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    from = bySize[0]!;
    to = bySize[bySize.length - 1]!;
  } else {
    const byScore = [...held].sort((a, b) => score(b[0]) - score(a[0]) || a[0].localeCompare(b[0]));
    const best = byScore[0]!;
    const worst = byScore[byScore.length - 1]!;
    [from, to] = profile.moveStyle === "momentum" ? [worst, best] : [best, worst];
  }
  if (from[0] === to[0]) return null;
  const step = Math.min(profile.moveBps, rules.maxStepBps, from[1] - rules.minHoldingBps, rules.maxHoldingBps - to[1]);
  if (step < 50) return null;
  const weights = { ...current.weights, [from[0]]: from[1] - step, [to[0]]: to[1] + step };
  const why =
    profile.moveStyle === "rebalance"
      ? "to keep the book even"
      : profile.moveStyle === "momentum"
        ? "adding to what is working and cutting what stalls"
        : "buying what fell and trimming what ran";
  return { plan: { weights, cashBps: current.cashBps }, note: `${name}: moved ${step} bps from ${from[0]} to ${to[0]}, ${why}.`.slice(0, 280) };
}

export class FundManager {
  readonly id: string;
  private deciding = false;
  private revealing = false;
  private decidedBell = -1;
  private lastThinkBell = -1_000;
  private nextThink: ThinkMode = "normal";
  private tier: ModelTier | null = null;
  private tierQuarter = -1;
  private currentBell = 0;
  private dna: { season: number; dna: FundDna } | null = null;
  private promiseTries = new Map<number, number>();
  private lastQuarterSeen = -1;
  private lastRepSeen: number | null = null;
  private readonly status: ManagerStatus;

  constructor(private readonly d: ManagerDeps) {
    this.id = d.profile.id;
    this.status = {
      id: this.id,
      account: d.chain?.account ?? null,
      tier: null,
      autopilot: false,
      autopilotReason: null,
      waiting: d.chain ? null : "manager key missing",
      lastDecisionBell: null,
      lastCommitBell: null,
      lastRevealBell: null,
      lastAction: null,
      lastNote: null,
      lastError: null,
      billSeasonUsd: 0,
      decisions: 0,
      commits: 0,
      reveals: 0,
      holds: 0,
      crossTrades: 0,
      dnaSource: null,
    };
    const last = d.journal.recentNotes(this.id, 1)[0];
    if (last) this.status.lastNote = last.note;
  }

  health(seasonStartMs: number | null): ManagerStatus {
    return { ...this.status, billSeasonUsd: seasonStartMs === null ? 0 : this.d.journal.billTotal(this.id, seasonStartMs) };
  }

  onAiRow(row: AiUsageRow): void {
    const bill = billUsd(row.costUsd, this.d.multiplier);
    if (!(bill > 0)) return;
    this.d.journal.addBill({
      id: row.id,
      fund: this.id,
      bell: this.currentBell,
      at: row.at,
      tier: this.tier ?? "small",
      think: this.nextThink,
      aiCostUsd: row.costUsd,
      multiplier: this.d.multiplier,
      billUsd: bill,
    });
  }

  tick(clock: ChainClock): void {
    if (!this.d.chain) {
      this.status.waiting = "manager key missing";
      return;
    }
    const now = this.d.now();
    const cfg = toClockConfig(clock);

    if (!this.revealing) {
      for (const p of this.d.store.list(this.id)) {
        if (!p.commitTx || p.revealTx || p.error === "expired") continue;
        const open = bellAtMs(cfg, p.bell);
        const close = open + clock.revealWindowSecs * 1000;
        if (now >= close) {
          p.error = "expired";
          this.d.store.save(p);
          this.status.lastError = `bell ${p.bell}: the reveal window closed before the plan was revealed`;
          continue;
        }
        if (now >= open + REVEAL_DELAY_MS) {
          this.revealing = true;
          void this.reveal(p, clock).finally(() => (this.revealing = false));
          break;
        }
      }
    }
    const next = bellIndexAt(cfg, now) + 1;
    const tNext = bellAtMs(cfg, next);
    const lead = Math.min(this.d.leadSecs, clock.bellSecs * 0.5) * 1000;

    if (!this.deciding && this.decidedBell < next && now >= tNext - lead && now < tNext - Math.min(MIN_THINK_MS, lead / 2)) {
      this.deciding = true;
      this.decidedBell = next;
      void this.decide(next, clock)
        .catch((e: unknown) => {
          this.status.lastError = errMsg(e);
          this.d.log.warn({ fund: this.id, bell: next, err: errMsg(e) }, "decision failed");
        })
        .finally(() => (this.deciding = false));
    }
  }

  private resolveDna(fund: ChainFund, season: number): FundDna {
    if (this.dna && this.dna.season === season && this.dna.dna.source !== "neutral") return this.dna.dna;
    const dna = resolveFundDna({
      fund: this.id,
      network: this.d.network,
      season,
      chainCommit: fund.dna?.commit ?? null,
      chainSeed: fund.dna?.seed ?? null,
      revealed: fund.dna?.revealed ?? null,
    });
    this.dna = { season, dna };
    this.status.dnaSource = dna.source;
    if (dna.note) this.d.log.info({ fund: this.id, note: dna.note }, "fund DNA neutral");
    return dna;
  }

  private note(bell: number, note: string, extra: Partial<ManagerNoteRecord> = {}): void {
    const rec: ManagerNoteRecord = {
      fund: this.id,
      bell,
      note,
      think: this.nextThink,
      tier: this.tier ?? "small",
      autopilot: false,
      adjusted: false,
      at: new Date(this.d.now()).toISOString(),
      ...extra,
    };
    this.d.journal.addNote(rec);
    this.status.lastNote = note;
    void this.d.journal.flush(this.d.api);
  }

  private enterAutopilot(bell: number, reason: string): void {
    if (!this.status.autopilot) {
      this.note(bell, `On autopilot: ${reason}. Holding the current portfolio until it can think again.`, { autopilot: true });
      this.d.log.warn({ fund: this.id, bell, reason }, "fund on autopilot");
    }
    this.status.autopilot = true;
    this.status.autopilotReason = reason;
    this.status.lastAction = `bell ${bell}: autopilot`;
  }

  private leaveAutopilot(): void {
    if (this.status.autopilot) this.d.log.info({ fund: this.id }, "fund back from autopilot");
    this.status.autopilot = false;
    this.status.autopilotReason = null;
  }

  private async decide(bell: number, clock: ChainClock): Promise<void> {
    const cfg = toClockConfig(clock);
    const tBell = bellAtMs(cfg, bell);
    const [fund, detail] = await Promise.all([this.d.reader.fund(this.id), this.d.api.fund(this.id)]);
    if (!fund) {
      this.status.waiting = "fund not on chain yet";
      return;
    }
    if (fund.status && fund.status !== "active") {
      this.status.waiting = `fund ${fund.status}`;
      return;
    }
    this.status.waiting = null;
    const now = this.d.now();
    const { quarter, season, quarterInSeason } = quarterIndex(clock, now);
    const first = Object.keys(fund.plan.weights).length === 0;
    if (this.tierQuarter !== quarter || !this.tier) {
      this.tier = tierForValue(fund.valueUsd);
      this.tierQuarter = quarter;
      this.status.tier = this.tier;
    }
    const traits = this.resolveDna(fund, season).traits;
    const promiseOpen = (!fund.promise || (fund.promise.season !== null && fund.promise.season !== season)) && quarterInSeason === 0 && (this.promiseTries.get(season) ?? 0) < 3;

    const snapshot = await this.d.snapshot(bell);
    const quarterTurned = this.lastQuarterSeen !== quarter;
    const repDropped = this.lastRepSeen !== null && fund.reputation < this.lastRepSeen;
    this.lastQuarterSeen = quarter;
    this.lastRepSeen = fund.reputation;
    const every = thinkEvery(traits.patience);
    const wake = first || promiseOpen || quarterTurned || repDropped || this.nextThink === "deep" || biggestMove(snapshot) >= 2 || (detail?.ret1d ?? 0) <= -3;
    if (!wake && bell - this.lastThinkBell < every) {
      this.status.lastAction = `bell ${bell}: holding (patient, thinks about every ${every} bells)`;
      return;
    }

    const llm = this.d.llm();
    if (!llm) {
      this.status.waiting = "AI is not configured (AI key, base URL or models missing)";
      return;
    }
    const verdict = this.d.budget.check("fund");
    if (!verdict.allowed) {
      this.enterAutopilot(bell, "the daily AI budget is used up");
      return;
    }
    const model = modelForTier(this.d.models(), this.tier);
    const nextBill = estimateNextBill({ recentBills: this.d.journal.recentBillAmounts(this.id), think: this.nextThink, price: this.d.prices.priceOf(model), multiplier: this.d.multiplier });
    const ap = autopilotCheck({ valueUsd: fund.valueUsd, cashBps: fund.cashBps, nextBillUsd: nextBill, firstAllocation: first });
    if (ap.autopilot) {
      this.enterAutopilot(bell, ap.reason as string);
      return;
    }
    this.leaveAutopilot();

    const rules = rulesFrom({
      ...(detail?.caps ?? {}),
      startupCapBps: fund.startupCapBps ?? detail?.caps?.startupCapBps ?? this.d.profile.startupCapBps,
      basketCapBps: fund.basketCapBps ?? detail?.caps?.basketCapBps ?? this.d.profile.basketCapBps,
      cryptoCapBps: fund.cryptoCapBps ?? this.d.profile.cryptoCapBps,
    });
    const universe = this.d.universe();
    const current: Plan = { weights: { ...fund.plan.weights }, cashBps: first ? 10_000 : fund.cashBps };
    const floor = cashFloorBps({ valueUsd: fund.valueUsd, nextBillUsd: nextBill });
    const sinceEntry: Record<string, number | null> = {};
    for (const h of detail?.holdings ?? []) sinceEntry[h.asset] = h.retSinceEntry;
    const state: FundState = {
      bell,
      season: season + 1,
      quarter: quarterInSeason + 1,
      valueUsd: fund.valueUsd,
      nav: fund.nav,
      supplyCoins: fund.supplyCoins,
      outsidePct: detail?.outsideHolders ?? (fund.supplyCoins && fund.managerStakeCoins !== null ? Number((((fund.supplyCoins - fund.managerStakeCoins) / fund.supplyCoins) * 100).toFixed(2)) : null),
      reputation: fund.reputation,
      coinPrice: detail?.coinPrice ?? fund.coinPrice,
      premiumPct: detail?.premium ?? fund.premiumPct,
      ret1d: detail?.ret1d ?? null,
      retSeason: detail?.retSeason ?? (fund.navSeasonStart ? Number(((fund.nav / fund.navSeasonStart - 1) * 100).toFixed(3)) : null),
      vsSpy: detail?.vsSpy ?? null,
      current: first ? { weights: {}, cashBps: 10_000 } : current,
      sinceEntry,
      turnoverUsedPct: detail?.turnoverQuarterPct ?? fund.turnoverQuarterPct,
      tierLabel: tierLabel(this.tier),
      billSeasonUsd: this.d.journal.billTotal(this.id, clock.seasonStartMs + season * clock.quarters * clock.quarterSecs * 1000),
      cashFloorBps: floor,
      promise: fund.promise ? { targetBps: fund.promise.targetBps, bondBps: fund.promise.bondBps, progressPct: detail?.promise?.progressPct ?? null } : null,
      promiseOpen,
      crossHoldings: detail?.crossHoldings
        ? detail.crossHoldings.filter((c) => c.holder === this.id).map((c) => ({ target: c.target, valueUsd: c.valueUsd, pctOfTarget: c.pctOfTarget }))
        : ((await this.d.reader.crossHoldings?.(this.id).catch(() => [])) ?? []).map((c) => ({ target: c.target, valueUsd: c.valueUsd, pctOfTarget: (c.shareBps ?? 0) / 100 })),
      lastNotes: this.d.journal.recentNotes(this.id, 2).map((n) => n.note),
      crossBudgetUsd:
        fund.vaultYocto !== null
          ? Math.max(0, Math.floor(Math.min((fund.vaultYocto / 1e24) * clock.gameUsdPerNear, fund.valueUsd * 0.2 - (fund.crossValueUsd ?? 0))))
          : null,
    };
    const turnoverPct = this.d.profile.turnoverAllowanceBps / 100;
    const system = systemPrompt(this.d.profile, traits, rules, turnoverPct);
    const user = userPrompt(this.d.profile, state, snapshot, rules);
    const think = this.nextThink;
    this.currentBell = bell;
    this.status.decisions++;
    this.status.lastDecisionBell = bell;

    let decision: Decision;
    try {
      decision = await this.ask(llm, model, system, user, think, traits);
    } catch (e) {
      this.status.holds++;
      if (e instanceof AiPausedError) {
        this.enterAutopilot(bell, "the daily AI budget is used up");
        return;
      }
      const reason = e instanceof DecisionParseError ? "my plan did not come through in a usable form" : "I could not reach my AI brain";
      this.note(bell, `Held the portfolio this bell: ${reason}.`);
      this.status.lastAction = `bell ${bell}: hold (${reason})`;
      this.status.lastError = errMsg(e);
      return;
    }
    this.lastThinkBell = bell;
    this.nextThink = decision.think;

    let plan = repairPlan({ desired: decision.plan, current, universe, rules, cashFloorBps: floor, preference: (a) => this.d.profile.seedTilt(a) });

    if (!first && (!plan || samePlan(plan, current))) {
      const nudge = styleNudge(current, snapshot, this.d.profile, rules);
      const legal = nudge && validateWeights(weightsFromRecord(nudge.plan.weights), nudge.plan.cashBps, rules, { weights: weightsFromRecord(current.weights), cashBps: current.cashBps }).length === 0;
      if (nudge && legal) {
        plan = nudge.plan;
        decision = { ...decision, note: nudge.note };
      }
    }
    const check = plan ? validateWeights(weightsFromRecord(plan.weights), plan.cashBps, rules, first ? null : { weights: weightsFromRecord(current.weights), cashBps: current.cashBps }) : [];
    const india = plan ? Object.entries(plan.weights).reduce((s, [id, b]) => s + ((universe.get(id)?.region === "india") ? b : 0), 0) : 0;
    if (!plan || check.length || india > rules.indiaCapBps) {
      this.status.holds++;
      this.note(bell, cleanHold(decision.note, "the plan could not fit the fund's rules"));
      this.status.lastAction = `bell ${bell}: hold (plan broke the rules: ${check[0]?.message ?? "no valid allocation"})`;
      await this.afterDecision(decision, fund, snapshot, clock, season, promiseOpen);
      return;
    }
    const adjusted = !samePlan(plan, decision.plan);
    if (!first && samePlan(plan, current)) {
      this.status.holds++;
      this.note(bell, decision.note);
      this.status.lastAction = `bell ${bell}: hold (no change)`;
      await this.afterDecision(decision, fund, snapshot, clock, season, promiseOpen);
      return;
    }
    if (this.d.now() > tBell - COMMIT_MARGIN_MS) {
      this.status.holds++;
      this.note(bell, "Held the portfolio: my thinking ran past the bell.");
      this.status.lastAction = `bell ${bell}: missed the commit window`;
      return;
    }
    const salt = newSalt();
    const pending: PendingCommit = {
      fund: this.id,
      bell,
      plan,
      salt,
      hash: commitHashFor(this.id, bell, plan, salt),
      note: decision.note,
      think: decision.think,
      tier: this.tier,
      adjusted,
      cross: decision.cross,
      promise: promiseOpen ? (decision.promise ?? this.fallbackPromise(traits)) : null,
      createdAt: new Date().toISOString(),
      commitTx: null,
      committedAt: null,
      revealTx: null,
      revealedAt: null,
      error: null,
    };
    this.d.store.save(pending);
    const tx = await (this.d.chain as ManagerChain).commit(pending.hash, bell);
    pending.commitTx = tx.txHash;
    pending.committedAt = new Date().toISOString();
    this.d.store.save(pending);
    this.d.store.prune(this.id, bell);
    this.status.commits++;
    this.status.lastCommitBell = bell;
    this.status.lastAction = `bell ${bell}: committed (turnover ${(turnoverBps(current, plan) / 100).toFixed(1)}%)`;
    this.d.log.info({ fund: this.id, bell, tx: tx.txHash, turnoverBps: turnoverBps(current, plan), adjusted, think: decision.think }, "rebalance committed");
  }

  private async ask(llm: Llm, model: string, system: string, user: string, think: ThinkMode, traits: FundDna["traits"]): Promise<Decision> {
    const assetIds = [...this.d.universe().keys()];
    const fundIds = this.d.fundIds();
    const req = { model, system, feature: "fund" as const, company: this.id, temperature: decisionTemperature(traits), maxTokens: think === "deep" ? 2600 : 1400 };
    const first = await llm.chat({ ...req, user });
    try {
      return parseDecision(first.text, assetIds, fundIds, this.id);
    } catch (e) {
      if (!(e instanceof DecisionParseError)) throw e;
      const retry = await llm.chat({
        ...req,
        user: `${user}\n\nYour previous reply could not be used (${e.message}). Reply again with exactly one JSON object in the required format and nothing else.`,
      });
      return parseDecision(retry.text, assetIds, fundIds, this.id);
    }
  }

  private fallbackPromise(t: FundDna["traits"]): { targetBps: number; bondBps: number } {
    const target = Math.round(this.d.profile.basePromiseBps * (0.7 + t.greed * 0.06));
    const bond = Math.min(3000, 1000 + t.risk * 150);
    return { targetBps: target, bondBps: bond };
  }

  private async reveal(p: PendingCommit, clock: ChainClock): Promise<void> {
    const chain = this.d.chain as ManagerChain;
    try {
      const tx = await chain.reveal(p.plan, p.salt);
      p.revealTx = tx.txHash;
      p.revealedAt = new Date().toISOString();
      p.error = null;
      this.d.store.save(p);
      this.status.reveals++;
      this.status.lastRevealBell = p.bell;
      this.status.lastAction = `bell ${p.bell}: revealed`;
      this.d.log.info({ fund: this.id, bell: p.bell, tx: tx.txHash }, "rebalance revealed");
      this.note(p.bell, p.note, { think: p.think, tier: p.tier, adjusted: p.adjusted });
    } catch (e) {
      const msg = errMsg(e);

      p.error = /not rung yet|timed? ?out|network|unreachable|ECONNREFUSED|fetch failed|nonce|RPC/i.test(msg) ? msg.slice(0, 300) : "expired";
      this.d.store.save(p);
      this.status.lastError = `bell ${p.bell} reveal: ${msg.slice(0, 200)}`;
      this.d.log.warn({ fund: this.id, bell: p.bell, err: msg.slice(0, 300) }, "reveal failed");
      return;
    }
    const fund = await this.d.reader.fund(this.id).catch(() => null);
    if (!fund) return;
    const now = this.d.now();
    const { season } = quarterIndex(clock, now);
    const snapshot = await this.d.snapshot(p.bell).catch(() => null);
    await this.crossTrades(p.cross, fund, snapshot, clock.gameUsdPerNear);
    if (p.promise) await this.setPromise(p.promise, season);
  }

  private async afterDecision(decision: Decision, fund: ChainFund, snapshot: MarketSnapshot, clock: ChainClock, season: number, promiseOpen: boolean): Promise<void> {
    await this.crossTrades(decision.cross, fund, snapshot, clock.gameUsdPerNear);
    if (promiseOpen) await this.setPromise(decision.promise ?? this.fallbackPromise(this.resolveDna(fund, season).traits), season);
  }

  private async crossTrades(orders: readonly CrossOrder[], fund: ChainFund, snapshot: MarketSnapshot | null, gameUsdPerNear = 100): Promise<void> {
    if (!orders.length || !this.d.chain) return;
    const funds = await this.d.reader.funds().catch(() => [] as ChainFund[]);
    const byId = new Map(funds.map((f) => [f.id, f]));
    const held = new Map(((await this.d.reader.crossHoldings?.(this.id).catch(() => [])) ?? fund.crossHoldings).map((c) => [c.target, c.coins]));
    const priceOf = (id: string): number => byId.get(id)?.coinPrice ?? snapshot?.funds.find((r) => r.id === id)?.coinPrice ?? byId.get(id)?.nav ?? 10;
    let crossValue = fund.crossValueUsd ?? [...held.entries()].reduce((s, [t, c]) => s + c * priceOf(t), 0);

    let vaultUsd = fund.vaultYocto !== null ? (fund.vaultYocto / 1e24) * gameUsdPerNear : Number.POSITIVE_INFINITY;
    for (const o of orders.slice(0, 2)) {
      const target = byId.get(o.fund);
      if (!target) continue;
      const coinsHeld = held.get(o.fund) ?? 0;
      const price = priceOf(o.fund);
      let usd = o.usd;
      if (o.side === "buy") {
        const roomOwn = 0.2 * fund.valueUsd - crossValue;
        const roomTarget = target.supplyCoins !== null ? 0.1 * target.supplyCoins * price - coinsHeld * price : roomOwn;
        usd = Math.floor(Math.min(usd, roomOwn, roomTarget, vaultUsd) * 0.97);
        const block = crossTradeBlock({
          targetReputation: target.reputation,
          targetSupplyShareBps: target.supplyCoins ? Math.round(((coinsHeld + usd / price) / target.supplyCoins) * 10_000) : 0,
          ownValueShareBps: fund.valueUsd > 0 ? Math.round(((crossValue + usd) / fund.valueUsd) * 10_000) : 10_000,
        });
        if (block || usd < 50) {
          this.d.log.info({ fund: this.id, target: o.fund, wanted: o.usd, reason: block ?? (vaultUsd < 50 ? "no investor money in the vault yet" : "too small after caps") }, "cross buy skipped");
          continue;
        }
      } else {
        usd = Math.floor(Math.min(usd, coinsHeld * price));
        if (usd < 50) continue;
      }
      try {
        const tx = await this.d.chain.crossTrade(o.fund, o.side, usd);
        this.status.crossTrades++;
        crossValue += o.side === "buy" ? usd : -usd;
        if (o.side === "buy") vaultUsd -= usd;
        this.d.log.info({ fund: this.id, target: o.fund, side: o.side, usd, tx: tx.txHash }, "cross trade");
      } catch (e) {
        this.status.lastError = `cross ${o.side} ${o.fund}: ${errMsg(e).slice(0, 200)}`;
        this.d.log.warn({ fund: this.id, target: o.fund, err: errMsg(e).slice(0, 300) }, "cross trade failed");
      }
    }
  }

  private async setPromise(p: { targetBps: number; bondBps: number }, season: number): Promise<void> {
    if (!this.d.chain) return;
    const tries = this.promiseTries.get(season) ?? 0;
    if (tries >= 3) return;
    this.promiseTries.set(season, tries + 1);
    const bond = Math.max(1, Math.min(3000, Math.round(p.bondBps)));

    const target = Math.max(1, Math.min(10_000, Math.round(p.targetBps / 2 ** tries)));
    try {
      const tx = await this.d.chain.setPromise(target, bond);
      this.promiseTries.set(season, 99);
      this.d.log.info({ fund: this.id, target, bond, tx: tx.txHash }, "promise set");
    } catch (e) {
      const msg = errMsg(e);
      if (/already set|first quarter|retired/i.test(msg)) this.promiseTries.set(season, 99);
      this.status.lastError = `promise: ${msg.slice(0, 200)}`;
      this.d.log.warn({ fund: this.id, target, bond, err: msg.slice(0, 300) }, "set_promise failed");
    }
  }

  get billingBell(): number {
    return this.currentBell;
  }
}

function cleanHold(note: string, reason: string): string {
  const base = `Held the portfolio: ${reason}.`;
  return note && note.length + base.length < 270 ? `${base} ${note}` : base;
}

export const newBillId = (): string => randomUUID();
