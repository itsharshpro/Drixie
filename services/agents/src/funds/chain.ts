import type { ChainSigner, TxResult } from "../near/signer.js";
import type { NearRpc } from "../near/rpc.js";
import type { Plan, UniverseAsset } from "./rules.js";
import { sortedEntries } from "./commit.js";

export const MICRO = 1_000_000;

export interface ChainClock {
  bellSecs: number;
  quarterSecs: number;
  quarters: number;
  seasonStartMs: number;
  season: number;
  revealWindowSecs: number;
  gameUsdPerNear: number;
}

export interface ChainFund {
  id: string;
  name: string | null;
  manager: string | null;
  valueUsd: number;
  nav: number;
  supplyCoins: number | null;
  managerStakeCoins: number | null;
  cashBps: number;
  plan: Plan;
  reputation: number;
  startupCapBps: number | null;
  basketCapBps: number | null;

  cryptoCapBps?: number | null;
  lastBell: number | null;
  promise: { targetBps: number; bondBps: number; season: number | null } | null;
  crossHoldings: { target: string; coins: number }[];
  pendingCommitBell: number | null;
  dna: { commit: string | null; seed: string | null; revealed: Record<string, unknown> | null } | null;
  status: string | null;

  coinPrice: number | null;
  premiumPct: number | null;
  navSeasonStart: number | null;
  turnoverQuarterPct: number | null;
  crossValueUsd: number | null;

  vaultYocto: number | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

const pick = (o: Obj, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

const microToUsd = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / MICRO;
};

const coins = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / 1e18;
};

export function weightsFrom(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(v)) {
    for (const e of v) {
      if (Array.isArray(e) && typeof e[0] === "string") {
        const b = num(e[1]);
        if (b && b > 0) out[e[0]] = b;
      } else if (isObj(e) && typeof e.asset === "string") {
        const b = num(e.bps);
        if (b && b > 0) out[e.asset] = b;
      }
    }
  } else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      const b = num(x);
      if (b && b > 0) out[k] = b;
    }
  }
  return out;
}

export function parseClock(raw: unknown): ChainClock | null {
  if (!isObj(raw)) return null;

  const c = isObj(raw.clock) ? raw.clock : isObj(raw.season) ? raw.season : raw;
  const bellSecs = num(pick(c, "bell_secs")) ?? num(pick(raw, "bell_secs"));
  const nsRaw = pick(c, "genesis_ns", "season_start_ns", "start_ns") ?? pick(raw, "genesis_ns", "season_start_ns");

  const startNs = typeof nsRaw === "string" && /^\d+$/.test(nsRaw) ? Number(BigInt(nsRaw) / 1_000_000n) * 1e6 : num(nsRaw);
  const startMs = num(pick(c, "season_start_ms", "start_ms")) ?? num(pick(raw, "season_start_ms"));
  if (!bellSecs || (startNs === null && startMs === null)) return null;
  return {
    bellSecs,
    quarterSecs: num(pick(c, "quarter_secs")) ?? num(pick(raw, "quarter_secs")) ?? 86_400,
    quarters: num(pick(c, "quarters")) ?? num(pick(raw, "quarters")) ?? 4,
    seasonStartMs: startMs ?? Math.floor((startNs as number) / 1e6),
    season: num(pick(raw, "season_number", "current_season")) ?? 0,
    revealWindowSecs: num(pick(c, "reveal_secs", "reveal_window_secs")) ?? num(pick(raw, "reveal_secs", "reveal_window_secs")) ?? 180,
    gameUsdPerNear: num(pick(raw, "game_usd_per_near")) ?? num(pick(c, "game_usd_per_near")) ?? 100,
  };
}

export function parseFund(raw: unknown, idHint?: string): ChainFund | null {
  if (!isObj(raw)) return null;
  const id = (typeof raw.id === "string" ? raw.id : typeof raw.fund === "string" ? raw.fund : idHint) ?? null;
  if (!id) return null;
  const caps = isObj(raw.caps) ? raw.caps : isObj(raw.mandate) ? raw.mandate : raw;
  const nav = microToUsd(pick(raw, "nav_micro_usd", "nav")) ?? 10;
  const supply = coins(pick(raw, "supply", "total_supply"));
  const value = microToUsd(pick(raw, "value_micro_usd", "value")) ?? (supply !== null ? supply * nav : 0);
  const pr = pick(raw, "promise");
  const dna = pick(raw, "dna");
  const crossRaw = pick(raw, "cross_holdings", "cross");
  const cross: { target: string; coins: number }[] = [];
  if (Array.isArray(crossRaw)) {
    for (const c of crossRaw) {
      if (isObj(c) && typeof c.target === "string") cross.push({ target: c.target, coins: coins(c.coins) ?? 0 });
      else if (Array.isArray(c) && typeof c[0] === "string") cross.push({ target: c[0], coins: coins(c[1]) ?? 0 });
    }
  }
  const pending = pick(raw, "pending_commit", "commit");
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : null,
    manager: typeof raw.manager === "string" ? raw.manager : null,
    valueUsd: value,
    nav,
    supplyCoins: supply,
    managerStakeCoins: coins(pick(raw, "manager_stake", "manager_coins", "seed_coins")),
    cashBps: num(pick(raw, "cash_bps")) ?? 0,
    plan: { weights: weightsFrom(pick(raw, "weights", "holdings")), cashBps: num(pick(raw, "cash_bps")) ?? 0 },
    reputation: num(pick(raw, "reputation")) ?? 60,
    startupCapBps: num(pick(caps, "startup_cap_bps", "startup_cap")),
    basketCapBps: num(pick(caps, "basket_cap_bps", "basket_cap")),
    cryptoCapBps: num(pick(raw, "crypto_cap_bps")) ?? num(pick(caps, "crypto_cap_bps")),
    lastBell: num(pick(raw, "last_bell", "last_nav_bell")),
    promise: isObj(pr)
      ? { targetBps: num(pr.target_bps) ?? 0, bondBps: num(pr.bond_bps) ?? 0, season: num(pr.season) }
      : null,
    crossHoldings: cross,
    pendingCommitBell: isObj(pending) ? num(pending.bell) : num(pick(raw, "committed_bell", "commit_bell", "pending_bell")),
    dna: isObj(dna)
      ? {
          commit: typeof dna.commit === "string" ? dna.commit : null,
          seed: typeof dna.seed === "string" ? dna.seed : null,

          revealed: isObj(dna.traits) ? dna.traits : isObj(dna.revealed) ? dna.revealed : null,
        }
      : typeof raw.dna_commit === "string"
        ? { commit: raw.dna_commit, seed: typeof raw.dna_seed === "string" ? raw.dna_seed : null, revealed: isObj(raw.dna_revealed) ? raw.dna_revealed : null }
        : null,
    status: typeof raw.status === "string" ? raw.status : null,
    coinPrice: microToUsd(pick(raw, "coin_price", "coin_price_micro_usd")),
    premiumPct: (() => {
      const b = num(pick(raw, "premium_bps"));
      return b === null ? null : b / 100;
    })(),
    navSeasonStart: microToUsd(pick(raw, "nav_season_start")),
    turnoverQuarterPct: (() => {
      const b = num(pick(raw, "turnover_quarter_bps", "turnover_q_bps"));
      return b === null ? null : b / 100;
    })(),
    crossValueUsd: microToUsd(pick(raw, "cross_value")),
    vaultYocto: num(pick(raw, "vault")),
  };
}

export function parseUniverse(raw: unknown): UniverseAsset[] | null {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.assets) ? raw.assets : null;
  if (!list) return null;
  const out: UniverseAsset[] = [];
  for (const a of list) {
    if (!isObj(a) || typeof a.id !== "string" || typeof a.basket !== "string") continue;
    const kind = a.kind === "startup" ? "startup" : "stock";

    const region = a.region === "india" || a.region === "in" ? "india" : a.region === "private" ? "private" : "us";
    out.push({ id: a.id, basket: a.basket, kind, region });
  }
  return out.length ? out : null;
}

export interface FundsReader {
  clock(): Promise<ChainClock | null>;
  fund(id: string): Promise<ChainFund | null>;
  funds(): Promise<ChainFund[]>;
  universe(): Promise<UniverseAsset[] | null>;

  crossHoldings?(id: string): Promise<{ target: string; coins: number; valueUsd: number | null; shareBps: number | null }[]>;

  nowMs(): Promise<number>;
}

export class RpcFundsReader implements FundsReader {
  constructor(
    private readonly rpc: NearRpc,
    readonly contract: string,
  ) {}

  async clock() {
    return parseClock(await this.rpc.view<unknown>(this.contract, "get_config", {}));
  }
  async fund(id: string) {
    return parseFund(await this.rpc.view<unknown>(this.contract, "get_fund", { fund: id }), id);
  }
  async funds() {
    const raw = await this.rpc.view<unknown>(this.contract, "get_funds", {});
    const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.funds) ? raw.funds : [];
    return list.map((f) => parseFund(f)).filter((f): f is ChainFund => f !== null);
  }
  async universe() {
    return parseUniverse(await this.rpc.view<unknown>(this.contract, "get_universe", {}));
  }
  async crossHoldings(id: string) {
    const raw = await this.rpc.view<unknown>(this.contract, "get_cross_holdings", { fund: id });
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is Obj => isObj(r) && typeof r.target === "string")
      .map((r) => ({ target: r.target as string, coins: coins(r.coins) ?? 0, valueUsd: microToUsd(r.value_micro_usd), shareBps: num(r.share_of_supply_bps) }));
  }
  async nowMs() {
    return Number((await this.rpc.chainTimeNs()) / 1_000_000n);
  }
}

const GAS = { commit_rebalance: 30, reveal_rebalance: 150, cross_trade: 150, set_promise: 30 } as const;

export class ManagerChain {
  constructor(
    readonly fund: string,
    private readonly signer: ChainSigner,
    private readonly contract: string,
  ) {}

  get account(): string {
    return this.signer.accountId;
  }

  commit(hash: string, bell: number): Promise<TxResult> {
    return this.signer.call(this.contract, "commit_rebalance", { fund: this.fund, hash, bell }, { gasTgas: GAS.commit_rebalance });
  }

  reveal(plan: Plan, salt: string): Promise<TxResult> {
    return this.signer.call(
      this.contract,
      "reveal_rebalance",
      { fund: this.fund, weights: sortedEntries(plan), cash_bps: Math.trunc(plan.cashBps), salt },
      { gasTgas: GAS.reveal_rebalance },
    );
  }

  crossTrade(target: string, side: "buy" | "sell", usd: number): Promise<TxResult> {
    return this.signer.call(
      this.contract,
      "cross_trade",

      { fund: this.fund, target, side, usd: String(Math.round(usd * MICRO)) },
      { gasTgas: GAS.cross_trade },
    );
  }

  setPromise(targetBps: number, bondBps: number): Promise<TxResult> {
    return this.signer.call(this.contract, "set_promise", { fund: this.fund, target_bps: targetBps, bond_bps: bondBps }, { gasTgas: GAS.set_promise });
  }
}
