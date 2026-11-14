import { dz, fundBalances, funds, fundState, type Db } from "@listed/db";
import { RpcError, type NearRpc } from "@listed/db/near";
import { FUND_SEEDS, parseFundsClock, type SeedFundId } from "@listed/shared";
import type { Logger } from "pino";
import { capsFrom } from "./apply";
import { int, n, s, usdField, weightsOf } from "./decode";
import type { FundsDeployment } from "./deployment";

type Obj = Record<string, unknown>;

export interface ClockInfo {
  season: number;
  quarter: number;
  bell: number;
  bellSecs: number;
  quarterSecs: number;
  quarters: number;
  seasonStartMs: number | null;
  nextBellAt: string | null;
  gameUsdPerNear: number;
}

export function clockFromConfig(cfg: Obj | null, nowMs = Date.now()): ClockInfo {
  const c = parseFundsClock(cfg, nowMs);
  return {
    season: c.season,
    quarter: c.quarter,
    bell: c.bell,
    bellSecs: c.bellSecs,
    quarterSecs: c.quarterSecs,
    quarters: c.quarters,
    seasonStartMs: c.seasonStartedAt ? Date.parse(c.seasonStartedAt) : null,
    nextBellAt: c.nextBellAt,
    gameUsdPerNear: c.gameUsdPerNear,
  };
}

export class FundsSnapshot {
  private config: Obj | null = null;
  private configAt = 0;
  private hasAssetPrices: { v: boolean; at: number } | null = null;

  constructor(
    private readonly db: Db,
    private readonly rpc: NearRpc,
    private readonly log: Logger,
  ) {}

  private async view<T>(contract: string, method: string, args: object = {}): Promise<T | null> {
    try {
      return await this.rpc.view<T>(contract, method, args);
    } catch (err) {
      if (err instanceof RpcError && /METHOD_NOT_FOUND|MethodNotFound|CONTRACT_VIEW_ERROR/.test(`${err.causeName ?? ""} ${err.message}`)) return null;
      throw err;
    }
  }

  private async putState(key: string, value: unknown): Promise<void> {
    if (value === null || value === undefined) return;
    await this.db
      .insert(fundState)
      .values({ key, value })
      .onConflictDoUpdate({ target: fundState.key, set: { value, updatedAt: new Date() } });
  }

  async loadConfig(): Promise<Obj | null> {
    if (this.config && Date.now() - this.configAt < 30_000) return this.config;
    const [r] = await this.db.select().from(fundState).where(dz.eq(fundState.key, "config")).limit(1);
    if (r) {
      this.config = r.value as Obj;
      this.configAt = Date.now();
    }
    return this.config;
  }

  async gameUsdPerNear(): Promise<number> {
    return clockFromConfig(await this.loadConfig()).gameUsdPerNear;
  }

  async clock(): Promise<ClockInfo> {
    return clockFromConfig(await this.loadConfig());
  }

  async spyAt(at: Date): Promise<number | null> {
    const now = Date.now();
    if (!this.hasAssetPrices || now - this.hasAssetPrices.at > 60_000) {
      const r = await this.db.execute<{ t: string | null }>(dz.sql`SELECT to_regclass('public.asset_prices')::text AS t`);
      this.hasAssetPrices = { v: !!r[0]?.t, at: now };
    }
    if (!this.hasAssetPrices.v) return null;
    try {
      const rows = await this.db.execute<{ p: number | string | null }>(
        dz.sql`SELECT close_usd AS p FROM asset_prices WHERE asset = 'SPY' AND ts <= ${at.toISOString()}::timestamptz ORDER BY ts DESC LIMIT 1`,
      );
      const p = rows[0]?.p;
      return p === null || p === undefined ? null : Number(p);
    } catch {
      return null;
    }
  }

  tokenToFund(dep: FundsDeployment, tokenId: string): string {
    for (const [fund, tok] of Object.entries(dep.tokenIds)) if (tok === tokenId) return fund;
    const m = /^(?:coin[:\-])?([a-z0-9_-]+)$/.exec(tokenId);
    return m?.[1] ?? tokenId;
  }

  private tokenOf(dep: FundsDeployment, fund: string): string {
    return dep.tokenIds[fund] ?? fund;
  }

  async nftToken(contract: string, tokenId: string): Promise<Obj | null> {
    return this.view<Obj>(contract, "nft_token", { token_id: tokenId });
  }

  async refreshAll(dep: FundsDeployment): Promise<void> {
    const c = dep.contract;
    const cfg = await this.view<Obj>(c, "get_config");
    if (cfg) {
      await this.putState("config", cfg);
      this.config = cfg;
      this.configAt = Date.now();
    }
    const vault = await this.view<Obj>(c, "get_vault");
    if (vault) await this.putState("vault", vault);
    const universe = await this.view<unknown>(c, "get_universe");
    if (universe) await this.putState("universe", universe);
    const list = await this.view<unknown>(c, "get_funds");
    const items = listOf(list);
    for (const f of items) await this.upsertFund(dep, f);
    if (!items.length) {
      for (const id of Object.keys(FUND_SEEDS)) {
        const f = await this.view<Obj>(c, "get_fund", { fund: id }).catch(() => null);
        if (f) await this.upsertFund(dep, { id, ...f });
      }
    }
    const ids = (await this.db.select({ id: funds.id }).from(funds)).map((r) => r.id);
    for (const id of ids) await this.refreshPool(dep, id);
  }

  async refreshFunds(dep: FundsDeployment, ids: Set<string>): Promise<void> {
    for (const id of ids) {
      const f = await this.view<Obj>(dep.contract, "get_fund", { fund: id }).catch(() => null);
      if (f) await this.upsertFund(dep, { id, ...f });
      await this.refreshPool(dep, id);
    }
    const vault = await this.view<Obj>(dep.contract, "get_vault").catch(() => null);
    if (vault) await this.putState("vault", vault);
  }

  private async refreshPool(dep: FundsDeployment, id: string): Promise<void> {
    const p = await this.view<Obj>(dep.contract, "get_pool", { fund: id }).catch(() => null);
    if (!p) return;
    const near = int(p, "near_reserve", "near", "reserve_near");
    const coin = int(p, "coin_reserve", "coins", "reserve_coin", "coin");
    const fee = n(p, "fee_bps");
    if (!near && !coin) return;
    await this.db
      .update(funds)
      .set({ ...(near ? { poolNear: near } : {}), ...(coin ? { poolCoin: coin } : {}), ...(fee !== null ? { poolFeeBps: fee } : {}), updatedAt: new Date() })
      .where(dz.eq(funds.id, id));
  }

  async upsertFund(dep: FundsDeployment, f: Obj): Promise<void> {
    const id = s(f, "id", "fund", "fund_id");
    if (!id) return;
    const seed = FUND_SEEDS[id as SeedFundId];
    const capsSrc = (f.caps && typeof f.caps === "object" ? (f.caps as Obj) : f) as Obj;
    const caps = capsFrom(id, capsSrc);
    const weightsRaw = f.weights ?? f.holdings;
    const weights = weightsRaw !== undefined ? weightsOf(weightsRaw) : null;
    const pool = (f.pool && typeof f.pool === "object" ? (f.pool as Obj) : null) as Obj | null;
    const status = f.liquidated === true || s(f, "status") === "liquidated" || s(f, "status") === "retired" ? "liquidated" : f.autopilot === true || s(f, "status") === "autopilot" ? "autopilot" : "active";
    const values = {
      id,
      name: s(f, "name") ?? seed?.name ?? id,
      mandate: s(f, "mandate") ?? seed?.mandate ?? "balanced",
      manager: s(f, "manager", "agent", "manager_id") ?? dep.managers[id] ?? "",
      caps,
      seedUsd: usdField(f, "seed_usd", "seed_micro_usd") ?? seed?.seedUsd ?? 0,
      status,
      supply: int(f, "supply", "total_supply") ?? "0",
      managerStake: int(f, "manager_coins", "manager_stake", "stake") ?? "0",
      navMicro: int(f, "nav_micro_usd", "nav_micro", "nav") ?? "10000000",
      valueMicro: int(f, "value_micro_usd", "value_micro", "value") ?? "0",
      lastBell: n(f, "last_bell", "bell"),
      cashBps: n(f, "cash_bps") ?? 0,
      poolNear: (pool ? int(pool, "near_reserve", "near") : null) ?? int(f, "pool_near") ?? "0",
      poolCoin: (pool ? int(pool, "coin_reserve", "coins") : null) ?? int(f, "pool_coin", "pool_coins") ?? "0",
      dnaCommitted: !!(f.dna_hash ?? f.dna_commit ?? f.dna_committed ?? (f.dna && typeof f.dna === "object" ? (f.dna as Obj).commit : null)),
      raw: f,
    };
    const set: Record<string, unknown> = { ...values, updatedAt: new Date() };
    delete set.id;

    delete set.cashBps;
    if (!int(f, "pool_near") && !pool) {
      delete set.poolNear;
      delete set.poolCoin;
    }
    if (!int(f, "nav_micro_usd", "nav_micro", "nav")) delete set.navMicro;
    if (!int(f, "value_micro_usd", "value_micro", "value")) delete set.valueMicro;
    if (!int(f, "supply", "total_supply")) delete set.supply;
    if (values.lastBell === null) delete set.lastBell;

    const rep = n(f, "reputation", "reputation_score");
    const dna = dnaTraits(f.dna);
    if (dna) set.dna = dna;
    if (f.dna && typeof f.dna === "object" && (f.dna as Obj).commit) set.dnaCommitted = true;
    await this.db
      .insert(funds)
      .values({ ...values, weights: weights ?? [], ...(rep !== null ? { reputation: rep } : {}), ...(dna ? { dna } : {}) })
      .onConflictDoUpdate({ target: funds.id, set });
  }

  async refreshBalances(dep: FundsDeployment, pairs: Set<string>): Promise<void> {
    for (const key of pairs) {
      const [fund, account] = key.split("\u0000") as [string, string];
      if (!fund || !account || account === dep.contract) continue;
      const bal = await this.view<unknown>(dep.contract, "mt_balance_of", { account_id: account, token_id: this.tokenOf(dep, fund) }).catch(() => null);
      if (bal === null || bal === undefined) continue;
      const coins = typeof bal === "string" || typeof bal === "number" ? String(bal) : (int(bal as Obj, "balance", "amount") ?? null);
      if (!coins || !/^\d+$/.test(coins)) continue;
      await this.db
        .insert(fundBalances)
        .values({ fund, account, coins, firstAt: new Date() })
        .onConflictDoUpdate({ target: [fundBalances.fund, fundBalances.account], set: { coins, updatedAt: new Date() } });
    }
  }
}

export function dnaTraits(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Obj;
  const keys = ["risk", "patience", "greed", "loyalty", "smarts"];
  if (Array.isArray(o.traits) && o.traits.length === 5) {
    const out: Record<string, number> = {};
    keys.forEach((k, i) => (out[k] = Number((o.traits as unknown[])[i])));
    return out;
  }
  if (o.traits && typeof o.traits === "object") return dnaTraits({ ...(o.traits as Obj) });
  if (keys.every((k) => typeof o[k] === "number")) return Object.fromEntries(keys.map((k) => [k, o[k] as number]));
  return null;
}

function listOf(v: unknown): Obj[] {
  if (Array.isArray(v)) return v.filter((x): x is Obj => !!x && typeof x === "object");
  if (v && typeof v === "object") {
    const o = v as Obj;
    if (Array.isArray(o.funds)) return listOf(o.funds);
    return Object.entries(o)
      .filter(([, x]) => x && typeof x === "object")
      .map(([id, x]) => ({ id, ...(x as Obj) }));
  }
  return [];
}
