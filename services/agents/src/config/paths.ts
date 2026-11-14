import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function repoRoot(): string {
  const fromEnv = process.env.LISTED_REPO_ROOT;
  if (fromEnv) return resolve(fromEnv);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

export function dataDir(): string {
  return join(repoRoot(), ".data");
}

export function deploymentPath(network: string): string {
  return join(dataDir(), `deployment.${network}.json`);
}

export function keyPath(network: string, accountId: string): string {
  return join(dataDir(), "keys", network, `${accountId}.json`);
}

export function strategiesDir(): string {
  return join(repoRoot(), "services", "agents", "strategies");
}
