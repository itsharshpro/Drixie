import type { Account } from "near-api-js";
import type { Network } from "@listed/shared";
import { ChainClient } from "../client";
import { loadChainConfig } from "../config";
import { readDeployment, writeDeployment, type Deployment } from "../deployment";
import { env } from "../env";
import { FileKeyStore } from "../keystore";
import { nearToYoctoBig } from "../units";
import { ensureAccount } from "./accounts";
import type { Logger } from "./log";

export interface DeployOptions {
  network: Network;
  log: Logger;
}

export function baseFunding(read: (name: string) => string | undefined = env): { root: bigint; relayer: bigint; players: bigint } {
  return {
    root: nearToYoctoBig(read("FUND_ROOT_NEAR") ?? "6000"),
    relayer: nearToYoctoBig(read("FUND_RELAYER_NEAR") ?? "500"),
    players: nearToYoctoBig(read("FUND_PLAYERS_NEAR") ?? "3000"),
  };
}

export async function deployLocal(o: DeployOptions): Promise<{ deployment: Deployment }> {
  const { network, log } = o;
  if (network !== "sandbox") {
    throw new Error("Base accounts are a sandbox step. On testnet, scripts/deploy-funds.ts creates relayer.<root> and players.<root>.");
  }
  const cfg = loadChainConfig({ network });
  const keyStore = FileKeyStore.forNetwork(network);
  const client = new ChainClient(cfg.rpcUrl, keyStore);
  const fund = baseFunding();

  log.step(`waiting for RPC ${cfg.rpcUrl}`);
  const height = await client.waitForRpc(60_000);
  const chainId = await client.chainId();
  log.info(`chain ${chainId} at height ${height}`);

  const previous = readDeployment(network);
  const sameChain = previous && previous.root === cfg.root && (!previous.chainId || previous.chainId === chainId);
  if (previous && !sameChain) log.warn("existing deployment file is for another chain/root; it will be replaced");

  if (!keyStore.has("test.near")) throw new Error("Missing .data/keys/sandbox/test.near.json. Start the node first: ./scripts/sandbox.sh start");
  const deployer = client.account("test.near");
  if (!cfg.root.endsWith(`.${deployer.accountId}`)) throw new Error(`LISTED_ROOT (${cfg.root}) must be a sub-account of ${deployer.accountId} on the sandbox.`);
  log.step(`accounts (deployer ${deployer.accountId})`);
  const root: Account = await ensureAccount({ client, keyStore, creator: deployer, accountId: cfg.root, initial: fund.root, topUpBelow: fund.root / 4n, log });
  const child = (accountId: string, initial: bigint) => ensureAccount({ client, keyStore, creator: root, accountId, initial, topUpBelow: initial / 2n, log });
  const relayer = await child(cfg.relayer, fund.relayer);
  const players = await child(cfg.players, fund.players);

  const relayerPk = keyStore.requireKeyPair(relayer.accountId).getPublicKey().toString();
  if (!(await client.hasAccessKey(players.accountId, relayerPk))) {
    await client.addFullAccessKey(players, relayerPk);
    log.info(`added the relayer key to ${players.accountId}`);
  }

  const deployment: Deployment = {
    network,
    rpcUrl: cfg.rpcUrl,
    chainId,
    root: cfg.root,
    relayer: cfg.relayer,
    players: cfg.players,
    startBlock: sameChain && previous?.startBlock ? previous.startBlock : await client.blockHeight("final"),
    deployedAt: (sameChain && previous?.deployedAt) || new Date().toISOString(),
  };
  writeDeployment(deployment);
  return { deployment };
}
