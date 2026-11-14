import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRootEnv, repoRoot } from "@listed/db";
import { COMPUTE_MULTIPLIER_DEFAULT } from "@listed/fundmath";
import { NAV_PORT } from "@listed/shared";

export interface NavConfig {
  network: string;
  rpcUrl: string;
  host: string;
  port: number;
  redisUrl: string;

  deploymentFile: string;
  computeMultiplier: number;

  postGraceSecs: number;

  snapshotDelaySecs: number;

  blackSwanChanceBps: number;

  postEnabled: boolean;

  fallbackBellSecs: number;
}

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};
const num = (k: string, fallback: number, min: number): number => {
  const raw = env(k);
  const n = raw === undefined ? fallback : Number(raw);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

export function loadConfig(): NavConfig {
  loadRootEnv();
  const network = env("NEAR_NETWORK") ?? "sandbox";
  const post = env("NAV_POST");
  return {
    network,
    rpcUrl: env("NEAR_RPC_URL") ?? "http://127.0.0.1:3030",
    host: env("NAV_HOST") ?? (network === "sandbox" ? "127.0.0.1" : "0.0.0.0"),
    port: Math.floor(num("NAV_PORT", NAV_PORT, 1)),
    redisUrl: env("REDIS_URL") ?? "redis://127.0.0.1:56380",
    deploymentFile: env("FUNDS_DEPLOYMENT_FILE") ?? join(repoRoot(), ".data", `deployment.funds.${network}.json`),
    computeMultiplier: num("COMPUTE_MULTIPLIER", COMPUTE_MULTIPLIER_DEFAULT, 0),
    postGraceSecs: num("NAV_POST_GRACE_SECS", 15, 0),
    snapshotDelaySecs: num("NAV_SNAPSHOT_DELAY_SECS", 5, 0),
    blackSwanChanceBps: Math.floor(num("NAV_BLACK_SWAN_CHANCE_BPS", 1500, 0)),
    postEnabled: post === undefined ? network === "sandbox" : /^(1|true|yes)$/i.test(post),
    fallbackBellSecs: Math.floor(num("NAV_FALLBACK_BELL_SECS", 900, 60)),
  };
}

export interface FundsDeployment {
  contract: string;
  operator: string;

  operatorKey: string;

  operatorKeyFile: string | null;
  keeper: string | null;
  rpcUrl: string | null;
}

export function readDeployment(file: string): FundsDeployment | null {
  if (!existsSync(file)) return null;
  try {
    const d = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const str = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = k.split(".").reduce<unknown>((o, p) => (o && typeof o === "object" ? (o as Record<string, unknown>)[p] : undefined), d);
        if (typeof v === "string" && v.trim()) return v.trim();
        if (v && typeof v === "object") {
          const o = v as { accountId?: unknown; account?: unknown };
          if (typeof o.accountId === "string") return o.accountId;
          if (typeof o.account === "string") return o.account;
        }
      }
      return null;
    };
    const contract = str("contract", "fundsContract", "funds", "contractId", "account", "funds.contract");
    const operator = str("operator", "oracle", "roles.operator", "accounts.operator");
    if (!contract || !operator) return null;
    return {
      contract,
      operator,
      operatorKey: str("operatorKey", "keys.operator") ?? operator,
      operatorKeyFile: str("operator.keyFile", "operatorKeyFile"),
      keeper: str("keeper", "roles.keeper", "accounts.keeper"),
      rpcUrl: str("rpcUrl", "rpc"),
    };
  } catch {
    return null;
  }
}
