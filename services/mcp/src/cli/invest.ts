import { NearRpc, NearSigner, loadEnv, nearToYoctoBig, readFundsDeployment, readKey } from "@listed/agents/lib";
import { getAssets, getFund, listFunds, redeem, season, subscribe, ToolError, type FundsDeps } from "../funds.js";

const env = loadEnv();
if (env.NEAR_NETWORK !== "sandbox") {
  console.error("invest.ts runs on the local sandbox only");
  process.exit(2);
}
const [cmd = "list", a1, a2] = process.argv.slice(2);
const account = process.env.INVESTOR;
const key = account ? readKey(env.NEAR_NETWORK, account) : null;
const deps: FundsDeps = {
  network: env.NEAR_NETWORK,
  apiBase: `${env.API_URL.replace(/\/+$/, "")}/v1`,
  rpc: new NearRpc(env.NEAR_RPC_URL),
  contract: () => readFundsDeployment(env.NEAR_NETWORK)?.contract ?? null,
  investor: account && key ? new NearSigner(account, env.NEAR_RPC_URL, key.private_key) : null,
  investorNote: account ? `no key file for ${account}` : "set INVESTOR=<account> (key in .data/keys/sandbox/<account>.json)",
  maxOrder: nearToYoctoBig(env.MCP_MAX_ORDER_NEAR),
  explorerTxUrl: env.EXPLORER_TX_URL ?? null,
};

const run: Record<string, () => Promise<unknown>> = {
  list: () => listFunds(deps),
  fund: () => getFund(deps, a1 ?? "atlas"),
  assets: () => getAssets(deps, a1),
  season: () => season(deps),
  subscribe: () => subscribe(deps, a1 ?? "", a2 ?? ""),
  redeem: () => redeem(deps, a1 ?? "", a2 ?? "all"),
};
const fn = run[cmd];
if (!fn) {
  console.error(`commands: ${Object.keys(run).join(", ")}`);
  process.exit(2);
}
fn()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e: unknown) => {
    console.error(e instanceof ToolError ? e.message : e);
    process.exit(1);
  });
