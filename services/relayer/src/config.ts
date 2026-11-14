import { env, loadChainConfig, nearToYoctoBig, type ChainConfig } from "@listed/chain";
import { PORTS } from "@listed/shared";
import type { FaucetConfig } from "./faucet";

export interface RelayerConfig {
  chain: ChainConfig;
  port: number;
  host: string;
  serviceToken: string | null;
  starterBalance: bigint;

  corsOrigins: string[];
  trustProxy: boolean;

  senderSuffixes: string[];

  ignoredSenderSuffixes: string[];

  gasBudget: { perSender: bigint; total: bigint };

  lowBalance: bigint;

  sharedPlayersKey: boolean;

  provision: { perUserPerDay: number; perIpPerDay: number; dailyFaucet: bigint };

  faucet: FaucetConfig;
  maxTtlBlocks: number;
  maxActions: number;
  rate: { senderPerMinute: number; senderBurst: number; ipPerMinute: number; ipBurst: number; provisionPerMinute: number };
  registryRefreshMs: number;

  refundGas: boolean;

  maxGasRefund: bigint;
  logLevel: string;
}

const int = (name: string, fallback: number): number => {
  const v = env(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer (got "${v}")`);
  return n;
};

const list = (v: string | undefined): string[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const near = (name: string, fallback: string): bigint => nearToYoctoBig(env(name) ?? fallback);

export function loadRelayerConfig(): RelayerConfig {
  const chain = loadChainConfig();
  const web = env("WEB_URL") ?? "http://localhost:3000";
  const sandbox = chain.network === "sandbox";
  const senders = senderSuffixesFor(chain.network, chain.players, list(env("RELAYER_SENDER_SUFFIXES")));
  const starterBalance = near("STARTER_BALANCE_NEAR", "5");
  return {
    chain,
    port: int("RELAYER_PORT", PORTS.relayer),

    host: env("RELAYER_HOST") ?? (chain.network === "sandbox" ? "127.0.0.1" : "0.0.0.0"),
    serviceToken: env("SERVICE_TOKEN") ?? null,
    starterBalance,
    corsOrigins: Array.from(
      new Set([web, "http://localhost:3000", "http://127.0.0.1:3000", ...list(env("RELAYER_CORS_ORIGINS"))]),
    ),
    trustProxy: env("RELAYER_TRUST_PROXY") === "1" || env("RELAYER_TRUST_PROXY") === "true",

    senderSuffixes: senders.suffixes,
    ignoredSenderSuffixes: senders.ignored,
    gasBudget: {
      perSender: near("RELAYER_DAILY_GAS_NEAR_PER_SENDER", sandbox ? "5" : "0.5"),
      total: near("RELAYER_DAILY_GAS_NEAR", sandbox ? "500" : "25"),
    },
    lowBalance: near("RELAYER_LOW_BALANCE_NEAR", sandbox ? "20" : "3"),
    sharedPlayersKey: env("RELAYER_SHARED_PLAYERS_KEY") === "1" || env("RELAYER_SHARED_PLAYERS_KEY") === "true",
    provision: {
      perUserPerDay: int("RELAYER_PROVISION_PER_USER_PER_DAY", sandbox ? 20 : 1),
      perIpPerDay: int("RELAYER_PROVISION_PER_IP_PER_DAY", sandbox ? 200 : 5),

      dailyFaucet: env("RELAYER_DAILY_FAUCET_NEAR") ? near("RELAYER_DAILY_FAUCET_NEAR", "0") : starterBalance * (sandbox ? 1000n : 100n),
    },
    faucet: {

      dailyBudget: near("FAUCET_DAILY_NEAR", sandbox ? "50" : "2"),
      maxPerRequest: near("FAUCET_MAX_NEAR", sandbox ? "10" : "1"),
      perAccountPerDay: int("FAUCET_PER_ACCOUNT_PER_DAY", sandbox ? 3 : 1),
      perUserPerDay: int("FAUCET_PER_USER_PER_DAY", sandbox ? 3 : 1),
      reasons: list(env("FAUCET_REASONS") ?? "season"),
    },
    maxTtlBlocks: int("RELAYER_MAX_TTL_BLOCKS", 1_000),
    maxActions: int("RELAYER_MAX_ACTIONS", 8),
    rate: {
      senderPerMinute: int("RELAYER_RATE_SENDER_PER_MIN", 30),
      senderBurst: int("RELAYER_RATE_SENDER_BURST", 10),
      ipPerMinute: int("RELAYER_RATE_IP_PER_MIN", 120),
      ipBurst: int("RELAYER_RATE_IP_BURST", 30),
      provisionPerMinute: int("RELAYER_RATE_PROVISION_PER_MIN", 30),
    },
    registryRefreshMs: int("RELAYER_REGISTRY_REFRESH_MS", 30_000),
    refundGas: env("RELAYER_REFUND_GAS") !== "0" && env("RELAYER_REFUND_GAS") !== "false",
    maxGasRefund: nearToYoctoBig(env("RELAYER_MAX_GAS_REFUND_NEAR") ?? "0.05"),
    logLevel: env("LOG_LEVEL") ?? "info",
  };
}

export function senderSuffixesFor(network: string, players: string, explicit: string[]): { suffixes: string[]; ignored: string[] } {
  if (network === "sandbox") return { suffixes: explicit, ignored: [] };
  const under = (s: string) => s === players || s.endsWith(`.${players}`);
  const kept = explicit.filter(under);
  return { suffixes: kept.length ? kept : [players], ignored: explicit.filter((s) => !under(s)) };
}

export function defaultSenderSuffixes(network: string, players: string, explicit: string[]): string[] {
  return senderSuffixesFor(network, players, explicit).suffixes;
}
