import {
  ChainCallError,
  FileKeyStore,
  FundsClient,
  humanError,
  quoteBuyCoin,
  quoteSellCoin,
  readFundsDeployment,
  usdToYocto,
  withSlippageBps,
  yoctoToUsd,
  type FundsDeployment,
} from "@listed/chain";
import type { FundsResponse, Network } from "@listed/shared";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Account } from "near-api-js";
import { KeyedMutex, RecentActions } from "../activity";
import { HourlyLimiter } from "../limits";
import type { Logger } from "../log";
import { MAKER_RULE, makerDecide, makerDelayMs, makerSize, type MakerDecision } from "./maker";
import { RULES, type Book, type FundSnap, type HouseAction, type RuleName, type Sizing } from "./rules";

export interface HouseConfig {
  network: Network;
  apiUrl: string;
  keysDir: string;
  stateFile: string;
  tickMs: number;

  gasFloor: bigint;
  sizing: Sizing;
  actionsPerHour: number;
  slippageBps: number;

  makerPerHour: number;
}

interface HouseState {

  lastBell: Record<string, number>;
  counters: Record<string, number>;

  frenzyUntil: number | null;
}

const BELL_PACED: ReadonlySet<RuleName> = new Set(["chaser", "prudent", "planner"]);

export class HouseInvestors {
  readonly actions = new RecentActions(40);
  private readonly lock = new KeyedMutex();
  private readonly limiter: HourlyLimiter;
  private readonly signers = new Map<string, Account>();
  private state: HouseState;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private deployment: FundsDeployment | null = null;
  private funds: FundsClient | null = null;
  private lastSnapshot: { at: string; source: "api" | "chain"; bell: number | null } | null = null;
  lastError: string | null = null;
  readonly balances = new Map<string, string>();
  private readonly makerLimiter: HourlyLimiter;
  private readonly makerActions = new RecentActions(20);
  private readonly makerSkips: Record<string, number> = {};
  private makerTimer: NodeJS.Timeout | null = null;
  private makerLastRound: string | null = null;

  private readonly lastSwapAt = new Map<string, number>();

  constructor(
    private readonly cfg: HouseConfig,
    private readonly log: Logger,
  ) {
    this.state = loadState(cfg.stateFile);
    this.limiter = new HourlyLimiter(cfg.actionsPerHour, Math.max(1, Math.ceil(cfg.actionsPerHour / 12)));
    this.makerLimiter = new HourlyLimiter(cfg.makerPerHour, Math.max(5, Math.ceil(cfg.makerPerHour / 12)));
  }

  private ensureDeployment(): boolean {
    const d = readFundsDeployment(this.cfg.network);
    if (!d || !d.codeHash) return false;
    if (!this.deployment || this.deployment.contract !== d.contract || this.deployment.updatedAt !== d.updatedAt) {
      this.deployment = d;
      this.funds = new FundsClient(d);
      this.signers.clear();
    }
    return true;
  }

  start(): void {
    if (this.timer) return;
    const tick = () => {
      if (this.running) return;
      this.running = true;
      void this.round()
        .catch((err: unknown) => {
          this.lastError = (err as Error).message;
          this.log.warn({ err: this.lastError }, "house round failed");
        })
        .finally(() => {
          this.running = false;
        });
    };
    this.timer = setInterval(tick, this.cfg.tickMs);
    setTimeout(tick, 3_000).unref();
    this.scheduleMaker(20_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.makerTimer) clearTimeout(this.makerTimer);
    this.makerTimer = null;
    saveState(this.cfg.stateFile, this.state);
  }

  frenzy(minutes: number): void {
    this.state.frenzyUntil = Date.now() + minutes * 60_000;
    saveState(this.cfg.stateFile, this.state);
  }

  private signer(accountId: string): Account {
    let s = this.signers.get(accountId);
    if (!s) {
      const store = new FileKeyStore(this.cfg.keysDir);
      s = (this.funds as FundsClient).client.accountWithKey(accountId, store.requireKeyPair(accountId));
      this.signers.set(accountId, s);
    }
    return s;
  }

  private async snapshot(): Promise<{ funds: FundSnap[]; bell: number | null } | null> {
    const fc = this.funds as FundsClient;
    let rows: FundSnap[] | null = null;
    let bell: number | null = null;
    try {
      const res = await fetch(`${this.cfg.apiUrl}/v1/funds`, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        const body = (await res.json()) as FundsResponse;
        if (!body.waiting && body.items.length) {
          rows = body.items.map((f) => ({ id: f.id, nav: f.nav, coinPrice: f.coinPrice, ret1d: f.ret1d, reputation: f.reputation, status: f.status }));
          bell = body.lastBell;
        }
      }
    } catch {

    }
    const rate = (this.deployment as FundsDeployment).gameUsdPerNear;
    if (!rows) {

      const list = await fc.funds().catch(() => null);
      if (!Array.isArray(list) || !list.length) return null;

      rows = list.map((f) => ({
        id: String(f.id),
        nav: microUsd(f.nav) ?? 10,
        coinPrice: microUsd(f.coin_price),
        ret1d: null,
        reputation: Number(f.reputation ?? 60),
        status: String(f.status ?? "active").toLowerCase(),
      }));
      const clock = await fc.view<{ last_nav_bell?: number | null }>("get_clock").catch(() => null);
      bell = clock?.last_nav_bell ?? null;
    }
    for (const r of rows) {
      const pool = await fc.pool(r.id).catch(() => null);
      if (pool && BigInt(pool.coins ?? "0") > 0n) r.coinPrice = yoctoToUsd((BigInt(pool.near) * 10n ** 18n) / BigInt(pool.coins), rate);
    }
    this.lastSnapshot = { at: new Date().toISOString(), source: bell !== null ? "api" : "chain", bell };
    return { funds: rows, bell };
  }

  private async book(account: string, funds: FundSnap[]): Promise<Book> {
    const fc = this.funds as FundsClient;
    const rate = (this.deployment as FundsDeployment).gameUsdPerNear;
    const bal = await fc.client.getBalance(account);
    this.balances.set(account, (Number(bal / 10n ** 20n) / 1e4).toFixed(4));
    const spendable = bal > this.cfg.gasFloor ? bal - this.cfg.gasFloor : 0n;
    const coins: Record<string, bigint> = {};
    for (const f of funds) coins[f.id] = BigInt((await fc.coinBalance(f.id, account).catch(() => "0")) ?? "0");
    const pending = new Set<string>();
    const pendingUsd: Record<string, number> = {};
    const orders = await fc.orders(account).catch(() => []);
    for (const o of Array.isArray(orders) ? orders : []) {

      pending.add(String(o.fund));
      if (o.side === "subscribe") pendingUsd[o.fund] = (pendingUsd[o.fund] ?? 0) + yoctoToUsd(BigInt(o.amount), rate);
    }
    return { cashUsd: yoctoToUsd(spendable, rate), coins, pending, pendingUsd };
  }

  async round(): Promise<void> {
    if (!this.ensureDeployment()) return;
    const snap = await this.snapshot();
    if (!snap) return;
    const d = this.deployment as FundsDeployment;
    const frenzy = this.state.frenzyUntil !== null && Date.now() < this.state.frenzyUntil;

    const bellKey = snap.bell ?? -1;
    for (const h of d.house) {
      const rule = h.name as RuleName;
      if (!RULES[rule]) continue;
      if (BELL_PACED.has(rule) && !frenzy && this.state.lastBell[h.account] === bellKey) continue;
      const book = await this.book(h.account, snap.funds);
      let plan: HouseAction[] = RULES[rule](snap.funds, book, this.cfg.sizing);
      if (frenzy && rule !== "arb") plan = frenzyPlan(snap.funds, book, this.cfg.sizing);
      for (const a of plan) {
        if (!this.limiter.tryTake()) break;
        await this.lock.run(h.account, () => this.execute(h.account, rule, a));
      }
      if (BELL_PACED.has(rule)) this.state.lastBell[h.account] = bellKey;
    }
    saveState(this.cfg.stateFile, this.state);
  }

  private async execute(account: string, rule: RuleName, a: HouseAction): Promise<void> {
    const fc = this.funds as FundsClient;
    const rate = (this.deployment as FundsDeployment).gameUsdPerNear;
    const signer = this.signer(account);
    const label = a.kind === "subscribe" || a.kind === "buy_coin" ? `$${a.usd.toFixed(2)}` : `${(Number(a.coins / 10n ** 12n) / 1e6).toFixed(4)} coins`;
    try {
      let tx: string;
      if (a.kind === "subscribe") tx = (await fc.subscribe(signer, a.fund, usdToYocto(a.usd, rate))).txHash;
      else if (a.kind === "redeem") tx = (await fc.redeem(signer, a.fund, a.coins)).txHash;
      else if (a.kind === "buy_coin") {
        const pool = await fc.pool(a.fund);
        if (!pool) throw new Error("pool not found");
        const near = usdToYocto(a.usd, rate);
        const q = quoteBuyCoin(pool, near);
        tx = (await fc.buyCoin(signer, a.fund, near, withSlippageBps(q.out, this.cfg.slippageBps))).txHash;
      } else {
        const pool = await fc.pool(a.fund);
        if (!pool) throw new Error("pool not found");
        const q = quoteSellCoin(pool, a.coins);
        tx = (await fc.sellCoin(signer, a.fund, a.coins, withSlippageBps(q.out, this.cfg.slippageBps))).txHash;
      }
      if (a.kind === "buy_coin" || a.kind === "sell_coin") this.lastSwapAt.set(a.fund, Date.now());
      this.count(a.kind);
      this.actions.push({ who: account, action: `${rule}:${a.kind}`, ticker: a.fund, tx, ok: true, detail: `${label} — ${a.why}` });
      this.log.info({ account, rule, action: a.kind, fund: a.fund, amount: label, tx }, a.why);
    } catch (err) {
      this.limiter.refund();
      this.count("errors");
      const msg = err instanceof ChainCallError ? err.message : humanError(err).message;
      this.actions.push({ who: account, action: `${rule}:${a.kind}`, ticker: a.fund, ok: false, detail: `${label}: ${msg}` });
      this.log.warn({ account, rule, action: a.kind, fund: a.fund, err: msg }, "house action failed");
    }
  }

  private makerAccount(): string | null {
    const house = this.deployment?.house ?? [];
    return (house.find((h) => h.name === "maker") ?? house.find((h) => h.name === "arb"))?.account ?? null;
  }

  private scheduleMaker(ms: number): void {
    if (this.cfg.makerPerHour <= 0) return;
    this.makerTimer = setTimeout(() => {
      void this.makerRound()
        .catch((err: unknown) => this.log.warn({ err: (err as Error).message }, "maker round failed"))
        .finally(() => {
          if (this.timer) this.scheduleMaker(makerDelayMs(Math.random()));
        });
    }, ms);
  }

  async makerRound(): Promise<void> {
    if (!this.ensureDeployment()) return;
    const account = this.makerAccount();
    if (!account) return;
    const snap = await this.snapshot();
    if (!snap) return;
    this.makerLastRound = new Date().toISOString();
    const fc = this.funds as FundsClient;
    const d = this.deployment as FundsDeployment;
    for (const f of snap.funds) {
      if (this.makerLimiter.leftThisHour() <= 0) {
        this.makerSkip("hourly cap");
        break;
      }
      await this.lock.run(account, async () => {
        const pool = await fc.pool(f.id).catch(() => null);
        const held = BigInt((await fc.coinBalance(f.id, account).catch(() => "0")) ?? "0");
        const bal = await fc.client.getBalance(account);
        this.balances.set(account, (Number(bal / 10n ** 20n) / 1e4).toFixed(4));
        const last = this.lastSwapAt.get(f.id);
        const dec = makerDecide({
          fund: f.id,
          status: f.status,
          nav: f.nav,
          pool: pool ? { near: BigInt(pool.near), coins: BigInt(pool.coins) } : null,
          usdPerNear: d.gameUsdPerNear,
          heldCoins: held,
          spendable: bal > this.cfg.gasFloor ? bal - this.cfg.gasFloor : 0n,
          size: makerSize(Math.random()),
          sinceLastSwapMs: last === undefined ? null : Date.now() - last,
          rnd: Math.random(),
        });
        if (dec.kind === "skip") return this.makerSkip(dec.why);
        if (!this.makerLimiter.tryTake()) return this.makerSkip("hourly cap");
        await this.makerSwap(account, dec, pool as { near: string; coins: string });
      });
    }
  }

  private makerSkip(why: string): void {
    this.makerSkips[why] = (this.makerSkips[why] ?? 0) + 1;
  }

  private async makerSwap(account: string, dec: Exclude<MakerDecision, { kind: "skip" }>, pool: { near: string; coins: string }): Promise<void> {
    const fc = this.funds as FundsClient;
    const signer = this.signer(account);
    const label = dec.kind === "buy_coin" ? `${(Number(dec.near / 10n ** 18n) / 1e6).toFixed(4)} NEAR` : `${(Number(dec.coins / 10n ** 12n) / 1e6).toFixed(6)} coins`;
    try {
      const tx =
        dec.kind === "buy_coin"
          ? (await fc.buyCoin(signer, dec.fund, dec.near, withSlippageBps(quoteBuyCoin(pool, dec.near).out, this.cfg.slippageBps))).txHash
          : (await fc.sellCoin(signer, dec.fund, dec.coins, withSlippageBps(quoteSellCoin(pool, dec.coins).out, this.cfg.slippageBps))).txHash;
      this.lastSwapAt.set(dec.fund, Date.now());
      this.count(dec.kind === "buy_coin" ? "maker_buy" : "maker_sell");
      this.makerActions.push({ who: account, action: `maker:${dec.kind}`, ticker: dec.fund, tx, ok: true, detail: `${label} — ${dec.why}` });
      this.log.info({ account, rule: "maker", action: dec.kind, fund: dec.fund, amount: label, tx }, dec.why);
    } catch (err) {
      this.makerLimiter.refund();
      this.count("maker_errors");
      const msg = err instanceof ChainCallError ? err.message : humanError(err).message;
      this.makerActions.push({ who: account, action: `maker:${dec.kind}`, ticker: dec.fund, ok: false, detail: `${label}: ${msg}` });
      this.log.warn({ account, rule: "maker", action: dec.kind, fund: dec.fund, err: msg }, "maker swap failed");
    }
  }

  private count(name: string): void {
    this.state.counters[name] = (this.state.counters[name] ?? 0) + 1;
  }

  status(): Record<string, unknown> {
    const d = this.deployment;
    return {
      contract: d?.contract ?? null,
      waitingFor: d ? null : "the funds contract (.data/deployment.funds.<network>.json): run pnpm tsx scripts/deploy-funds.ts",
      investors: [
        ...(d?.house ?? []).map((h) => ({ account: h.account, rule: h.name, how: h.rule, nearLeft: this.balances.get(h.account) ?? null, lastBell: this.state.lastBell[h.account] ?? null })),
        ...(d && this.cfg.makerPerHour > 0 && !d.house.some((h) => h.name === "maker") ? [{ account: this.makerAccount(), rule: "maker", how: MAKER_RULE, nearLeft: this.balances.get(this.makerAccount() ?? "") ?? null, lastBell: null }] : []),
      ],
      maker: {
        account: d ? this.makerAccount() : null,
        how: MAKER_RULE,
        perHour: this.cfg.makerPerHour,
        swapsLastHour: this.makerLimiter.usedLastHour(),
        buys: this.state.counters.maker_buy ?? 0,
        sells: this.state.counters.maker_sell ?? 0,
        errors: this.state.counters.maker_errors ?? 0,
        skips: { ...this.makerSkips },
        lastRound: this.makerLastRound,
        lastSwaps: this.makerActions.list(undefined, 10),
      },
      counts: { ...this.state.counters },
      actionsLastHour: this.limiter.usedLastHour(),
      actionsPerHour: this.cfg.actionsPerHour,
      frenzyUntil: this.state.frenzyUntil && this.state.frenzyUntil > Date.now() ? new Date(this.state.frenzyUntil).toISOString() : null,
      snapshot: this.lastSnapshot,
      lastError: this.lastError,
      lastActions: this.actions.list(undefined, 20),
    };
  }
}

function frenzyPlan(funds: FundSnap[], book: Book, s: Sizing): HouseAction[] {
  const top = funds.filter((f) => f.ret1d !== null && f.status !== "liquidated").sort((a, b) => (b.ret1d as number) - (a.ret1d as number))[0];
  if (!top || book.pending.has(top.id)) return [];
  const usd = Math.min(book.cashUsd, book.cashUsd * s.maxShare * 2);
  return usd >= s.minUsd ? [{ kind: "subscribe", fund: top.id, usd, why: `retail frenzy: piling into ${top.id}` }] : [];
}

function microUsd(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n / 1e6 : null;
}

function loadState(file: string): HouseState {
  const empty: HouseState = { lastBell: {}, counters: {}, frenzyUntil: null };
  if (!existsSync(file)) return empty;
  try {
    return { ...empty, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<HouseState>) };
  } catch {
    return empty;
  }
}

function saveState(file: string, s: HouseState): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s) + "\n");
  renameSync(tmp, file);
}
