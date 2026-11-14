import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@listed/db";

export interface FundsDeployment {
  contract: string;
  startBlock: number;
  operator: string | null;
  managers: Record<string, string>;

  tokenIds: Record<string, string>;
  deployedAt: string | null;
  chainId: string | null;

  mtimeMs: number;
}

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function fundsDeploymentPath(network: string): string {
  return join(repoRoot(), ".data", `deployment.funds.${network}.json`);
}

export function parseFundsDeployment(raw: unknown, mtimeMs = 0): FundsDeployment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Obj;
  const contract = str(o.contract) ?? str(o.contractId) ?? str(o.contract_id) ?? str(o.account) ?? str(o.funds) ?? str((o.contract as Obj | undefined)?.account);
  const sb = Number(o.startBlock ?? o.start_block ?? o.deployBlock ?? o.deploy_block ?? NaN);
  if (!contract || !Number.isFinite(sb)) return null;
  const managers: Record<string, string> = {};
  const tokenIds: Record<string, string> = {};
  const m = o.managers ?? o.funds;
  if (Array.isArray(m)) {
    for (const it of m) {
      if (!it || typeof it !== "object") continue;
      const r = it as Obj;
      const id = str(r.id) ?? str(r.fund);
      const acc = str(r.manager) ?? str(r.account) ?? str(r.agent);
      if (id && acc) managers[id] = acc;
      const tok = str(r.tokenId) ?? str(r.token_id);
      if (id && tok) tokenIds[id] = tok;
    }
  } else if (m && typeof m === "object") {
    for (const [k, v] of Object.entries(m as Obj)) {
      const acc = str(v) ?? str((v as Obj | null)?.manager) ?? str((v as Obj | null)?.account);
      if (acc) managers[k] = acc;
    }
  }
  return {
    contract,
    startBlock: Math.max(0, Math.floor(sb)),
    operator: str(o.operator) ?? str((o.accounts as Obj | undefined)?.operator),
    managers,
    tokenIds,
    deployedAt: str(o.deployedAt) ?? str(o.deployed_at),
    chainId: str(o.chainId) ?? str(o.chain_id),
    mtimeMs,
  };
}

export function readFundsDeployment(network: string): FundsDeployment | null {
  const file = fundsDeploymentPath(network);
  if (!existsSync(file)) return null;
  try {
    return parseFundsDeployment(JSON.parse(readFileSync(file, "utf8")), statSync(file).mtimeMs);
  } catch {
    return null;
  }
}
