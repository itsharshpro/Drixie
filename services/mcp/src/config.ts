import { join } from "node:path";
import {
  NearRpc,
  NearSigner,
  loadEnv,
  readFundsDeployment,
  readKey,
  repoRoot,
  nearToYoctoBig,
  type ChainSigner,
  type Env,
  type Logger,
} from "@listed/agents/lib";
import { fileLedger, orderGate, SpendBudget } from "./budget.js";
import type { FundsDeps } from "./funds.js";

export interface McpConfig {
  env: Env;
  network: string;
  deps: FundsDeps;

  orderGate: string | null;
  budget: SpendBudget;
  budgetFile: string;
}

function loadInvestor(env: Env): { investor: ChainSigner | null; note: string | null } {
  const account = env.MCP_BUYER_ACCOUNT;
  if (!account) return { investor: null, note: "MCP_BUYER_ACCOUNT is not set, so subscribe and redeem are disabled on this server" };
  const key = env.MCP_BUYER_PRIVATE_KEY ?? readKey(env.NEAR_NETWORK, account)?.private_key;
  if (!key) return { investor: null, note: `no key for ${account}: set MCP_BUYER_PRIVATE_KEY or add .data/keys/${env.NEAR_NETWORK}/${account}.json` };
  return { investor: new NearSigner(account, env.NEAR_RPC_URL, key), note: null };
}

function near(value: string, fallback: string): bigint {
  try {
    return nearToYoctoBig(value);
  } catch {
    return nearToYoctoBig(fallback);
  }
}

const v1 = (base: string) => `${base.replace(/\/+$/, "")}/v1`;

export function loadConfig(log: Logger): McpConfig {
  const env = loadEnv();
  const rpc = new NearRpc(env.NEAR_RPC_URL);
  const gate = orderGate(env.MCP_HOST, env.MCP_AUTH_TOKEN);

  const { investor, note } = gate ? { investor: null, note: gate } : loadInvestor(env);
  const budgetFile = env.MCP_BUDGET_FILE ?? join(repoRoot(), ".data", "mcp", `budget.${env.NEAR_NETWORK}.json`);
  const budget = new SpendBudget(near(env.MCP_DAILY_BUDGET_NEAR, "5"), Date.now, fileLedger(budgetFile, (m) => log.warn(m)));

  let cached: { at: number; contract: string | null } = { at: 0, contract: null };
  const contract = (): string | null => {
    if (cached.contract || Date.now() - cached.at < 15_000) return cached.contract;
    cached = { at: Date.now(), contract: readFundsDeployment(env.NEAR_NETWORK)?.contract ?? null };
    return cached.contract;
  };
  return {
    env,
    network: env.NEAR_NETWORK,
    orderGate: gate,
    budget,
    budgetFile,
    deps: {
      network: env.NEAR_NETWORK,
      apiBase: v1(env.API_URL),
      rpc,
      contract,
      investor,
      investorNote: note,
      maxOrder: near(env.MCP_MAX_ORDER_NEAR, "1"),
      budget,
      explorerTxUrl: env.EXPLORER_TX_URL ?? null,
      log,
    },
  };
}
