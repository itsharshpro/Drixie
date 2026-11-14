import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Network } from "@listed/shared";
import { dataDir, keysDir } from "../paths";

export interface FundsManagerEntry {
  fund: string;

  account: string;

  publicKey: string;

  keyFile: string;
  methods: string[];
}

export interface FundsFundEntry {
  id: string;
  name: string;
  mandate: string;
  manager: string;
  seedUsd: number;

  poolNear: string;
  color: string;
}

export interface FundsHouseEntry {
  name: string;
  account: string;
  rule: string;

  keyFile: string;
}

export interface FundsDeployment {
  network: Network;
  rpcUrl: string;
  chainId: string;

  contract: string;
  owner: string;

  operator: {
    account: string;

    accountId: string;
    publicKey: string;
    keyFile: string;

    fullKeyFile: string;
  };

  roles: { operator: string; owner: string };
  managersParent: string;
  managers: FundsManagerEntry[];
  funds: FundsFundEntry[];
  house: FundsHouseEntry[];

  relayer: string;
  players: string;
  gameUsdPerNear: number;
  season: { bellSecs: number; quarterSecs: number; quarters: number; revealSecs: number; auctionSecs: number };

  reserveNear: string;

  startBlock: number;
  codeHash: string | null;
  wasm: string | null;
  deployedAt: string;
  updatedAt?: string;

  seeded?: { universe?: boolean; funds?: string[]; auctions?: string[]; houseSubscriptions?: string[] };
}

export const fundsDeploymentPath = (network: Network): string => join(dataDir(), `deployment.funds.${network}.json`);
export const managersKeysDir = (network: Network): string => join(keysDir(network), "managers");
export const navKeysDir = (network: Network): string => join(keysDir(network), "nav");

export function readFundsDeployment(network: Network): FundsDeployment | null {
  const file = fundsDeploymentPath(network);
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<FundsDeployment>;
  if (!parsed.contract || !parsed.rpcUrl) throw new Error(`${file} is missing "contract" or "rpcUrl". Re-run scripts/deploy-funds.ts.`);
  return { managers: [], funds: [], house: [], ...parsed } as FundsDeployment;
}

export function requireFundsDeployment(network: Network): FundsDeployment {
  const d = readFundsDeployment(network);
  if (!d) throw new Error(`No funds deployment for ${network} (${fundsDeploymentPath(network)}). Run: pnpm tsx scripts/deploy-funds.ts`);
  return d;
}

export function writeFundsDeployment(d: FundsDeployment): string {
  const file = fundsDeploymentPath(d.network);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...d, updatedAt: new Date().toISOString() }, null, 2) + "\n");
  renameSync(tmp, file);
  return file;
}
