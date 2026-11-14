import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRootEnv, repoRoot } from "@listed/db";

export interface IndexerConfig {
  network: string;
  rpcUrl: string;

  healthHost?: string;
  healthPort: number;
  redisUrl: string;
}

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

function deployedRpcUrl(network: string): string | undefined {
  const file = join(repoRoot(), ".data", `deployment.funds.${network}.json`);
  if (!existsSync(file)) return undefined;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { rpcUrl?: string }).rpcUrl;
  } catch {
    return undefined; // half-written or invalid; the follower waits for it
  }
}

export function loadConfig(): IndexerConfig {
  loadRootEnv();
  const network = env("NEAR_NETWORK") ?? "sandbox";
  return {
    network,
    rpcUrl: env("NEAR_RPC_URL") ?? deployedRpcUrl(network) ?? "http://127.0.0.1:3030",
    healthHost: env("INDEXER_HOST") ?? (network === "sandbox" ? "127.0.0.1" : "0.0.0.0"),
    healthPort: Number(env("INDEXER_PORT") ?? 4200),
    redisUrl: env("REDIS_URL") ?? "redis://127.0.0.1:56380",
  };
}
