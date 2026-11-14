import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { config as loadDotenv } from "dotenv";
import type { Network } from "@listed/shared";
import { repoRoot } from "./paths";

let loaded = false;

export function envFilePath(): string {
  const chosen = process.env.LISTED_ENV_FILE?.trim();
  if (!chosen) return join(repoRoot(), ".env");
  return isAbsolute(chosen) ? chosen : join(repoRoot(), chosen);
}

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = envFilePath();
  if (existsSync(file)) loadDotenv({ path: file, override: false, quiet: true });
  else if (process.env.LISTED_ENV_FILE?.trim()) throw new Error(`LISTED_ENV_FILE points at ${file}, which does not exist.`);
}

export function env(name: string): string | undefined {
  loadEnv();
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing environment variable ${name}. Set it in .env at the repo root.`);
  return value;
}

export function parseNetwork(value: string | undefined): Network {
  const v = (value ?? "sandbox").toLowerCase();
  if (v === "sandbox" || v === "testnet" || v === "mainnet") return v;
  throw new Error(`NEAR_NETWORK must be sandbox, testnet or mainnet (got "${value}").`);
}

export const currentNetwork = (): Network => parseNetwork(env("NEAR_NETWORK"));
