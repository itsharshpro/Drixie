import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Network } from "@listed/shared";

let cachedRoot: string | undefined;

export function repoRoot(): string {
  if (cachedRoot) return cachedRoot;
  const fromEnv = process.env.LISTED_REPO_ROOT;
  if (fromEnv) return (cachedRoot = resolve(fromEnv));
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = resolve(start);
    for (;;) {
      if (existsSync(join(dir, "pnpm-workspace.yaml"))) return (cachedRoot = dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("Could not find the repo root (pnpm-workspace.yaml). Set LISTED_REPO_ROOT.");
}

export const dataDir = (): string => join(repoRoot(), ".data");
export const keysDir = (network: Network): string => join(dataDir(), "keys", network);
export const deploymentPath = (network: Network): string =>
  join(dataDir(), `deployment.${network}.json`);
export const contractsResDir = (): string => join(repoRoot(), "contracts", "res");
