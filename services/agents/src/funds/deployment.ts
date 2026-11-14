import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAbsolute } from "node:path";
import type { KeyFile } from "../config/deployment.js";
import { dataDir, repoRoot } from "../config/paths.js";
import { defaultManagerAccount, FUND_IDS, type FundId } from "./roster.js";

export interface FundsDeployment {
  network: string;
  contract: string;
  operator: string | null;
  rpcUrl: string | null;
  managers: Record<string, string>;

  keyFiles: Record<string, string>;
  path: string;
}

export function fundsDeploymentPath(network: string): string {
  return join(dataDir(), `deployment.funds.${network}.json`);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseFundsDeployment(raw: unknown, network: string, path = ""): FundsDeployment | null {
  if (!isObj(raw)) return null;
  const c = isObj(raw.contract) ? raw.contract : null;
  const contract = str(c?.account) ?? str(c?.id) ?? str(raw.contract) ?? str(raw.contractId) ?? str(raw.contract_id) ?? str(raw.funds) ?? str(raw.account);
  if (!contract) return null;
  const managers: Record<string, string> = {};
  const keyFiles: Record<string, string> = {};
  const m = raw.managers ?? raw.funds_managers ?? (Array.isArray(raw.funds) ? raw.funds : null);
  if (Array.isArray(m)) {
    for (const e of m) {
      if (!isObj(e)) continue;
      const fund = str(e.fund) ?? str(e.id);
      const acct = str(e.account) ?? str(e.manager) ?? str(e.accountId);
      if (fund && acct) managers[fund] = acct;
      const kf = str(e.keyFile) ?? str(e.key_file) ?? str(e.agentKeyFile);
      if (acct && kf) keyFiles[acct] = kf;
    }
  } else if (isObj(m)) {
    for (const [fund, v] of Object.entries(m)) {
      const acct = str(v) ?? (isObj(v) ? (str(v.account) ?? str(v.manager)) : null);
      if (acct) managers[fund] = acct;
      const kf = isObj(v) ? (str(v.keyFile) ?? str(v.key_file)) : null;
      if (acct && kf) keyFiles[acct] = kf;
    }
  }
  for (const f of FUND_IDS) if (!managers[f]) managers[f] = defaultManagerAccount(f as FundId, contract);
  const op = raw.operator;
  return {
    network: str(raw.network) ?? network,
    contract,
    operator: str(op) ?? (isObj(op) ? str(op.account) : null),
    rpcUrl: str(raw.rpcUrl) ?? str(raw.rpc_url),
    managers,
    keyFiles,
    path,
  };
}

export function readFundsDeployment(network: string): FundsDeployment | null {
  const p = fundsDeploymentPath(network);
  if (!existsSync(p)) return null;
  try {
    return parseFundsDeployment(JSON.parse(readFileSync(p, "utf8")), network, p);
  } catch {
    return null;
  }
}

export function readKeyFile(path: string): KeyFile | null {
  const p = isAbsolute(path) ? path : join(repoRoot(), path);
  if (!existsSync(p)) return null;
  try {
    const k = JSON.parse(readFileSync(p, "utf8")) as Partial<KeyFile>;
    if (typeof k.account_id === "string" && typeof k.public_key === "string" && typeof k.private_key === "string" && k.private_key.startsWith("ed25519:")) {
      return { account_id: k.account_id, public_key: k.public_key, private_key: k.private_key };
    }
  } catch {

  }
  return null;
}
