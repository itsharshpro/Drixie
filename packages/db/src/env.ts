import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const up = resolve(dir, "..");
    if (up === dir) break;
    dir = up;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

let loaded = false;

export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  const path = join(repoRoot(), ".env");
  if (existsSync(path)) config({ path, override: false, quiet: true } as Parameters<typeof config>[0]);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. Add it to the repo-root .env (see .env.example).`);
  return v;
}

export function databaseUrl(): string {
  loadRootEnv();
  return requireEnv("DATABASE_URL");
}
