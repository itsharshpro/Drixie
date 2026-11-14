import { join } from "node:path";
import type { Account } from "near-api-js";
import type { Network } from "@listed/shared";
import { ChainClient, type TxResult } from "../client";
import { FileKeyStore } from "../keystore";
import { keysDir, repoRoot } from "../paths";
import { tgas } from "../units";
import { readFundsDeployment, requireFundsDeployment, type FundsDeployment } from "./deployment";

export interface FundsPoolView {
  near: string;
  coins: string;
  fee_bps?: number;
  [k: string]: unknown;
}

export interface FundsOrderView {
  id: string;
  fund: string;
  account: string;
  side: "subscribe" | "redeem";

  amount: string;
  queued_at_ns: string;
  after_bell: number | null;
}

export function signerFromKeyFile(client: ChainClient, accountId: string, keyFile: string): Account {
  const abs = keyFile.startsWith("/") ? keyFile : join(repoRoot(), keyFile);
  const dir = abs.slice(0, abs.lastIndexOf("/"));
  const name = abs.slice(abs.lastIndexOf("/") + 1).replace(/\.json$/, "");
  return client.accountWithKey(accountId, new FileKeyStore(dir).requireKeyPair(name));
}

export class FundsClient {
  readonly client: ChainClient;

  constructor(
    readonly deployment: FundsDeployment,
    client?: ChainClient,
  ) {
    this.client = client ?? new ChainClient(deployment.rpcUrl, FileKeyStore.forNetwork(deployment.network));
  }

  static load(network: Network): FundsClient {
    return new FundsClient(requireFundsDeployment(network));
  }

  static tryLoad(network: Network): FundsClient | null {
    const d = readFundsDeployment(network);
    return d ? new FundsClient(d) : null;
  }

  get contract(): string {
    return this.deployment.contract;
  }

  view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.client.view<T>(this.contract, method, args);
  }

  config = () => this.view<Record<string, unknown>>("get_config");
  universe = () => this.view<unknown[]>("get_universe");
  funds = () => this.view<Array<Record<string, unknown>>>("get_funds");
  fund = (fund: string) => this.view<Record<string, unknown> | null>("get_fund", { fund });
  weights = (fund: string) => this.view<unknown>("get_weights", { fund });
  pool = (fund: string) => this.view<FundsPoolView | null>("get_pool", { fund });
  vault = () => this.view<Record<string, unknown>>("get_vault");
  orders = (accountId: string) => this.view<FundsOrderView[]>("get_orders", { account: accountId });
  queue = (fund: string) => this.view<FundsOrderView[]>("get_queue", { fund, limit: 500 });
  coinBalance = (fund: string, accountId: string) => this.view<string>("mt_balance_of", { account_id: accountId, token_id: fund });

  operator(): Account {
    const o = this.deployment.operator;
    return signerFromKeyFile(this.client, o.account, o.keyFile);
  }

  manager(fund: string): Account {
    const m = this.deployment.managers.find((x) => x.fund === fund);
    if (!m) throw new Error(`No manager for fund "${fund}" in the funds deployment.`);
    return signerFromKeyFile(this.client, m.account, m.keyFile);
  }

  house(accountId: string): Account {
    return this.client.accountWithKey(accountId, new FileKeyStore(join(keysDir(this.deployment.network), "house")).requireKeyPair(accountId));
  }

  call<T = unknown>(signer: Account, method: string, args: Record<string, unknown>, o: { deposit?: bigint; gasTgas?: number } = {}): Promise<TxResult<T>> {
    return this.client.call<T>(signer, { contractId: this.contract, method, args, deposit: o.deposit ?? 0n, gas: tgas(o.gasTgas ?? 100) });
  }

  subscribe = (signer: Account, fund: string, depositYocto: bigint) => this.call(signer, "subscribe", { fund }, { deposit: depositYocto });
  redeem = (signer: Account, fund: string, coins: bigint) => this.call(signer, "redeem", { fund, coins: coins.toString() });
  buyCoin = (signer: Account, fund: string, nearYocto: bigint, minOut: bigint) =>
    this.call(signer, "swap_near_for_coin", { fund, min_out: minOut.toString() }, { deposit: nearYocto });
  sellCoin = (signer: Account, fund: string, coins: bigint, minOut: bigint) =>
    this.call(signer, "swap_coin_for_near", { fund, coins: coins.toString(), min_out: minOut.toString() });
}
