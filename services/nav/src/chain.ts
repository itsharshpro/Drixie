import { basename, dirname, isAbsolute, join } from "node:path";
import { ChainClient, FileKeyStore } from "@listed/chain";
import { repoRoot } from "@listed/db";
import type { Network, WeightEntry } from "@listed/shared";
import type { FundsDeployment } from "./config";

export interface ChainClock {
  nowMs: number;
  bell: number;
  bellAtMs: number;
  nextBellAtMs: number;
  revealClosesAtMs: number;
  quarter: number;
  quarterEndsAtMs: number;
  season: number;
  lastNavBell: number | null;
  lastClosedQuarter: number | null;
  lastSettledSeason: number | null;
}

export interface ChainConfig {
  gameUsdPerNear: number;
  genesisMs: number;
  bellSecs: number;
  quarterSecs: number;
  quarters: number;
  revealSecs: number;
  operator: string;
  lastPricesHash: string | null;
}

export interface ChainFund {
  id: string;
  status: string;
  active: boolean;
  nav: bigint;
  value: bigint;
  supply: bigint;
  ledgerSupply: bigint;
  managerCoins: bigint;
  vault: bigint;
  crossValue: bigint;
  weights: WeightEntry[];
  cashBps: number;
  lastRevealBell: number | null;
  turnoverQuarterBps: number;
  reputation: number;
  navQuarterStart: bigint;
  navSeasonStart: bigint;
  hasPromise: boolean;
  createdAtMs: number;
}

const nsToMs = (v: unknown): number => Math.floor(Number(BigInt(String(v ?? 0))) / 1e6);
const big = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? 0));
  } catch {
    return 0n;
  }
};
const optNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function parseClock(raw: Record<string, unknown>): ChainClock {
  return {
    nowMs: nsToMs(raw.now_ns),
    bell: Number(raw.bell),
    bellAtMs: nsToMs(raw.bell_at_ns),
    nextBellAtMs: nsToMs(raw.next_bell_at_ns),
    revealClosesAtMs: nsToMs(raw.reveal_closes_at_ns),
    quarter: Number(raw.quarter),
    quarterEndsAtMs: nsToMs(raw.quarter_ends_at_ns),
    season: Number(raw.season),
    lastNavBell: optNum(raw.last_nav_bell),
    lastClosedQuarter: optNum(raw.last_closed_quarter),
    lastSettledSeason: optNum(raw.last_settled_season),
  };
}

export function parseConfig(raw: Record<string, unknown>): ChainConfig {
  const clock = (raw.clock ?? {}) as Record<string, unknown>;
  return {
    gameUsdPerNear: Number(raw.game_usd_per_near ?? 100),
    genesisMs: nsToMs(clock.genesis_ns),
    bellSecs: Number(clock.bell_secs ?? 900),
    quarterSecs: Number(clock.quarter_secs ?? 86_400),
    quarters: Number(clock.quarters ?? 4),
    revealSecs: Number(clock.reveal_secs ?? 180),
    operator: String(raw.operator ?? ""),
    lastPricesHash: typeof raw.last_prices_hash === "string" && raw.last_prices_hash ? raw.last_prices_hash : null,
  };
}

export function parseFund(raw: Record<string, unknown>): ChainFund {
  const status = typeof raw.status === "string" ? raw.status : JSON.stringify(raw.status ?? "");
  const weights = Array.isArray(raw.weights) ? (raw.weights as { asset: string; bps: number }[]).map((w) => ({ asset: String(w.asset), bps: Number(w.bps) })) : [];
  return {
    id: String(raw.id),
    status,
    active: /active/i.test(status),
    nav: big(raw.nav),
    value: big(raw.value),
    supply: big(raw.supply),
    ledgerSupply: big(raw.ledger_supply),
    managerCoins: big(raw.manager_coins),
    vault: big(raw.vault),
    crossValue: big(raw.cross_value),
    weights,
    cashBps: Number(raw.cash_bps ?? 0),
    lastRevealBell: optNum(raw.last_reveal_bell),
    turnoverQuarterBps: Number(raw.turnover_quarter_bps ?? 0),
    reputation: Number(raw.reputation ?? 60),
    navQuarterStart: big(raw.nav_quarter_start),
    navSeasonStart: big(raw.nav_season_start),
    hasPromise: raw.promise !== null && raw.promise !== undefined,
    createdAtMs: nsToMs(raw.created_at_ns),
  };
}

export interface NavPostRow {
  fund: string;
  nav_micro_usd: string;
  value_micro_usd: string;
}

export class FundsChain {
  private readonly client: ChainClient;
  private readonly keyName: string;
  constructor(
    private readonly dep: FundsDeployment,
    network: string,
    rpcUrl: string,
  ) {

    if (dep.operatorKeyFile) {
      const abs = isAbsolute(dep.operatorKeyFile) ? dep.operatorKeyFile : join(repoRoot(), dep.operatorKeyFile);
      this.client = new ChainClient(dep.rpcUrl ?? rpcUrl, new FileKeyStore(dirname(abs)));
      this.keyName = basename(abs, ".json");
    } else {
      this.client = new ChainClient(dep.rpcUrl ?? rpcUrl, FileKeyStore.forNetwork(network as Network));
      this.keyName = dep.operatorKey;
    }
  }

  get contract(): string {
    return this.dep.contract;
  }

  async clock(): Promise<ChainClock> {
    return parseClock(await this.client.view<Record<string, unknown>>(this.dep.contract, "get_clock", {}));
  }

  async config(): Promise<ChainConfig> {
    return parseConfig(await this.client.view<Record<string, unknown>>(this.dep.contract, "get_config", {}));
  }

  async funds(): Promise<ChainFund[]> {
    const rows = await this.client.view<Record<string, unknown>[]>(this.dep.contract, "get_funds", {});
    return rows.map(parseFund);
  }

  private signer() {
    return this.client.account(this.dep.operator, this.keyName);
  }

  async postNav(bell: number, pricesHash: string, navs: NavPostRow[]): Promise<{ txHash: string; filled: number | null }> {
    const res = await this.client.call<number>(this.signer(), {
      contractId: this.dep.contract,
      method: "post_nav",
      args: { bell, prices_hash: pricesHash, navs },
      gas: 300_000_000_000_000n,
    });
    return { txHash: res.txHash, filled: typeof res.returnValue === "number" ? res.returnValue : null };
  }

  async closeQuarter(quarter: number, spyReturnBps: number | null): Promise<{ txHash: string }> {
    const res = await this.client.call(this.signer(), {
      contractId: this.dep.contract,
      method: "close_quarter",
      args: { quarter, spy_return_bps: spyReturnBps },
      gas: 300_000_000_000_000n,
    });
    return { txHash: res.txHash };
  }

  async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.client.view<T>(this.dep.contract, method, args);
  }

  async operatorCall<T = unknown>(method: string, args: Record<string, unknown>, tgas = 100): Promise<{ txHash: string; returnValue: T | undefined }> {
    const res = await this.client.call<T>(this.signer(), { contractId: this.dep.contract, method, args, gas: BigInt(tgas) * 1_000_000_000_000n });
    return { txHash: res.txHash, returnValue: res.returnValue as T | undefined };
  }

  async settleSeason(season: number, winner: string | null): Promise<{ txHash: string }> {
    const res = await this.client.call(this.signer(), {
      contractId: this.dep.contract,
      method: "settle_season",
      args: { season, winner },
      gas: 300_000_000_000_000n,
    });
    return { txHash: res.txHash };
  }
}
