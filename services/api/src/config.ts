import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRootEnv, repoRoot } from "@listed/db";
import type { Network } from "@listed/shared";

export interface ApiConfig {
  host: string;
  port: number;
  network: Network;

  rpcUrl: string;

  publicRpcUrl: string;
  root: string;
  relayerUrl: string;
  explorerTxUrl: string | null;

  webOrigins: string[];

  apiUrl: string;
  sessionSecret: string;
  sessionTtlDays: number;
  serviceToken: string | null;
  rpId: string;
  rpName: string;
  webauthnOrigins: string[];
  resendApiKey: string | null;
  emailFrom: string;
  cookieSecure: boolean;
  cookieSameSite: "lax" | "none" | "strict";
  redisUrl: string;

  maxContentBytes: number;

  trustProxy: boolean;

  agentsUrl: string;

  signupIpDailyLimit: number;

  starterBalanceNear: number;

  faucetDailyBudgetNear: number;

  sse: { maxPerIp: number; maxTotal: number; maxTopics: number; maxBufferedBytes: number; maxLifetimeMs: number };
}

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function hasSecretParts(url: string): boolean {
  try {
    const u = new URL(url);
    return !!(u.username || u.password || u.search);
  } catch {
    return false;
  }
}

export function publicRpcFor(network: Network, rpcUrl: string, publicRpcUrl: string | undefined): string {
  if (publicRpcUrl) return publicRpcUrl;
  if (network === "sandbox" || !hasSecretParts(rpcUrl)) return rpcUrl;
  return network === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org";
}

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

const list = (v: string | undefined): string[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

function deploymentRoot(network: string): { root?: string; rpcUrl?: string } {
  const file = join(repoRoot(), ".data", `deployment.${network}.json`);
  if (!existsSync(file)) return {};
  try {
    const d = JSON.parse(readFileSync(file, "utf8")) as { root?: string; rpcUrl?: string };
    return d;
  } catch {
    return {};
  }
}

export function loadConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  loadRootEnv();
  const network = (env("NEAR_NETWORK") ?? "sandbox") as Network;
  const dep = deploymentRoot(network);
  const webOrigins = list(env("WEB_URL") ?? "http://localhost:3000");
  const apiUrl = (env("API_URL") ?? "http://localhost:4000").replace(/\/$/, "");
  const rpcUrl = env("NEAR_RPC_URL") ?? dep.rpcUrl ?? "http://127.0.0.1:3030";
  const sameSite = (env("COOKIE_SAMESITE") ?? "lax").toLowerCase();
  const sandbox = network === "sandbox";
  const cfg: ApiConfig = {

    host: env("API_HOST") ?? (sandbox ? "localhost" : "0.0.0.0"),
    port: Number(env("API_PORT") ?? 4000),
    network,
    rpcUrl,
    publicRpcUrl: publicRpcFor(network, rpcUrl, env("PUBLIC_RPC_URL")),
    root: env("LISTED_ROOT") ?? dep.root ?? "listed.test.near",
    relayerUrl: (env("RELAYER_URL") ?? "http://localhost:4110").replace(/\/$/, ""),
    explorerTxUrl: env("EXPLORER_TX_URL") ?? null,
    webOrigins,
    apiUrl,
    sessionSecret: env("SESSION_SECRET") ?? "",
    sessionTtlDays: Number(env("SESSION_TTL_DAYS") ?? 30),
    serviceToken: env("SERVICE_TOKEN") ?? null,
    rpId: env("WEBAUTHN_RP_ID") ?? "localhost",
    rpName: env("WEBAUTHN_RP_NAME") ?? "Listed",
    webauthnOrigins: list(env("WEBAUTHN_ORIGIN") ?? webOrigins.join(",")),
    resendApiKey: env("RESEND_API_KEY") ?? null,
    emailFrom: env("EMAIL_FROM") ?? "Listed <hello@example.com>",
    cookieSecure: env("COOKIE_SECURE") ? env("COOKIE_SECURE") === "true" : apiUrl.startsWith("https://"),
    cookieSameSite: sameSite === "none" || sameSite === "strict" ? sameSite : "lax",
    redisUrl: env("REDIS_URL") ?? "redis://127.0.0.1:56380",
    maxContentBytes: Number(env("MAX_CONTENT_BYTES") ?? 256 * 1024),
    trustProxy: ["1", "true"].includes((env("API_TRUST_PROXY") ?? "").toLowerCase()),
    agentsUrl: (env("AGENTS_URL") ?? `http://127.0.0.1:${env("AGENTS_PORT") ?? "4300"}`).replace(/\/$/, ""),
    signupIpDailyLimit: num(env("SIGNUP_IP_DAILY_LIMIT"), sandbox ? 100 : 3),
    starterBalanceNear: num(env("STARTER_BALANCE_NEAR"), 5),
    faucetDailyBudgetNear: num(env("FAUCET_DAILY_BUDGET_NEAR"), sandbox ? 5000 : 100),
    sse: {
      maxPerIp: num(env("SSE_MAX_PER_IP"), sandbox ? 64 : 8),
      maxTotal: num(env("SSE_MAX_TOTAL"), 2000),
      maxTopics: num(env("SSE_MAX_TOPICS"), 20),
      maxBufferedBytes: num(env("SSE_MAX_BUFFERED_BYTES"), 1024 * 1024),
      maxLifetimeMs: num(env("SSE_MAX_LIFETIME_MS"), 60 * 60_000),
    },
    ...overrides,
  };
  if (!cfg.sessionSecret || cfg.sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 16 characters in the repo-root .env.");
  }
  return cfg;
}
