import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Network } from "@listed/shared";
import { deploymentPath } from "./paths";

export interface Deployment {
  network: Network;
  rpcUrl: string;
  root: string;

  relayer: string;

  players: string;

  startBlock: number;
  chainId?: string;
  deployedAt?: string;
  updatedAt?: string;
}

export function readDeployment(network: Network): Deployment | null {
  const file = deploymentPath(network);
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<Deployment>;
  if (!parsed.root || !parsed.rpcUrl) {
    throw new Error(`${file} is missing "root" or "rpcUrl". Re-run scripts/deploy-local.ts.`);
  }
  return parsed as Deployment;
}

export function requireDeployment(network: Network): Deployment {
  const d = readDeployment(network);
  if (!d) {
    throw new Error(
      `No deployment for ${network} (${deploymentPath(network)}). Run: pnpm tsx scripts/deploy-local.ts`,
    );
  }
  return d;
}

export function writeDeployment(deployment: Deployment): string {
  const file = deploymentPath(deployment.network);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const body = { ...deployment, updatedAt: new Date().toISOString() };
  writeFileSync(tmp, JSON.stringify(body, null, 2) + "\n");
  renameSync(tmp, file);
  return file;
}
