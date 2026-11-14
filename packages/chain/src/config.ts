import { accounts, type Network } from "@listed/shared";
import { currentNetwork, env } from "./env";
import { readDeployment, type Deployment } from "./deployment";

export interface ChainConfig {
  network: Network;
  rpcUrl: string;
  root: string;
  relayer: string;
  players: string;
  relayerUrl: string;
  explorerTxUrl: string | null;

  deployment: Deployment | null;
}

const DEFAULT_RPC: Record<Network, string> = {
  sandbox: "http://127.0.0.1:3030",
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

const DEFAULT_ROOT: Partial<Record<Network, string>> = { sandbox: "listed.test.near" };

export function loadChainConfig(opts: { network?: Network } = {}): ChainConfig {
  const network = opts.network ?? currentNetwork();
  const deployment = readDeployment(network);
  const root = env("LISTED_ROOT") ?? deployment?.root ?? DEFAULT_ROOT[network];
  if (!root) {
    throw new Error(`LISTED_ROOT is not set for ${network}. Set it in .env (e.g. listed-yourname.testnet).`);
  }
  const rpcUrl = env("NEAR_RPC_URL") ?? deployment?.rpcUrl ?? DEFAULT_RPC[network];
  return {
    network,
    rpcUrl,
    root,
    relayer: env("RELAYER_ACCOUNT_ID") ?? deployment?.relayer ?? accounts.relayer(root),
    players: deployment?.players ?? accounts.playersParent(root),
    relayerUrl: env("RELAYER_URL") ?? "http://localhost:4110",
    explorerTxUrl: env("EXPLORER_TX_URL") ?? null,
    deployment,
  };
}
