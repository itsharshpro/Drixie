import { readFileSync, existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { config as loadDotenv, parse as parseDotenv } from "dotenv";
import { z } from "zod";
import { repoRoot } from "./paths.js";

const bool = z
  .string()
  .optional()
  .transform((v) => v === undefined || v === "" ? undefined : /^(1|true|yes|on)$/i.test(v));
const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative());
const str = (def: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? def : v.trim()));
const optStr = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const EnvSchema = z.object({
  NEAR_NETWORK: z.enum(["sandbox", "testnet", "mainnet"]).catch("sandbox"),
  NEAR_RPC_URL: str("http://127.0.0.1:3030"),
  LISTED_ROOT: str("listed.test.near"),
  API_URL: str("http://localhost:4000"),
  SERVICE_TOKEN: optStr,
  REDIS_URL: optStr,

  DATABASE_URL: optStr,
  EXPLORER_TX_URL: optStr,

  LLM_PROVIDER: str("ai"),
  AI_API_KEY: optStr,
  AI_BASE_URL: optStr,
  AI_MODEL_PRIMARY: optStr,
  AI_MODEL_JUDGE: optStr,

  AI_MODEL_SMALL: optStr,
  AI_MODEL_BEST: optStr,

  AI_THINKING_TOKENS: int(1024),

  AI_PRICE_TABLE: optStr,

  AI_DAILY_BUDGET_USD: str("5"),

  AI_JOB_RESERVE_BPS: int(3000),

  AI_USAGE_URL: optStr,
  LLM_BASE_URL: str("https://cloud-api.near.ai/v1"),
  NEARAI_API_KEY: optStr,

  LLM_MODEL_PRIMARY: str("Qwen/Qwen3.8-27B"),
  LLM_MODEL_JUDGE: str("z-ai/glm-5.3-flash"),
  LLM_SIGNING_ALGO: z.enum(["ecdsa", "ed25519"]).catch("ecdsa"),
  LLM_TIMEOUT_MS: int(120_000),

  COMPUTE_MULTIPLIER: str("20000"),

  FUND_TICK_MS: int(2000),
  FUND_DECIDE_LEAD_SECS: int(240),
  AGENTS_PORT: int(4300),

  MCP_PORT: int(4400),
  MCP_HOST: str("127.0.0.1"),
  MCP_BUYER_ACCOUNT: optStr,
  MCP_BUYER_PRIVATE_KEY: optStr,
  MCP_AUTH_TOKEN: optStr,
  MCP_MAX_ORDER_NEAR: str("1"),
  MCP_DAILY_BUDGET_NEAR: str("5"),

  MCP_BUDGET_FILE: optStr,

  MCP_PUBLIC_READ: bool,

  MCP_RATE_PER_MIN: int(120),
  MCP_ORDER_RATE_PER_MIN: int(6),

  MCP_TRUST_PROXY: bool,

  MCP_PUBLIC_API_URL: optStr,
});

export type Env = z.infer<typeof EnvSchema>;

let loaded = false;

export function envFilePath(): string {
  const chosen = process.env.LISTED_ENV_FILE?.trim();
  if (!chosen) return join(repoRoot(), ".env");
  return isAbsolute(chosen) ? chosen : join(repoRoot(), chosen);
}

export function loadEnv(): Env {
  if (!loaded) {
    loadDotenv({ path: envFilePath(), quiet: true } as Parameters<typeof loadDotenv>[0]);
    loaded = true;
  }
  return EnvSchema.parse(process.env);
}

export function rereadEnvVar(name: string): string | undefined {
  const file = envFilePath();
  if (!existsSync(file)) return process.env[name] || undefined;
  try {
    const parsed = parseDotenv(readFileSync(file));
    const v = parsed[name]?.trim();
    return v ? v : process.env[name] || undefined;
  } catch {
    return process.env[name] || undefined;
  }
}
