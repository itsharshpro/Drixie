import { currentNetwork, env, fundsBudget, fundsDeploymentPath, fundsFundingPlan, yoctoToNearString, FUND_LAUNCHES, HOUSE_INVESTORS } from "../packages/chain/src/index";
import { deployFunds, findFundsWasm } from "../packages/chain/src/ops/funds-deploy";
import { createLogger } from "../packages/chain/src/ops/log";
import { loadWasm } from "../packages/chain/src/ops/wasm";

function waitMs(): number {
  const i = process.argv.indexOf("--wait");
  const minutes = i >= 0 ? Number(process.argv[i + 1]) : Number(env("WASM_WAIT_MINUTES") ?? 20);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("--wait takes a number of minutes");
  return minutes * 60_000;
}

function printPlan(network: "sandbox" | "testnet"): void {
  const f = fundsFundingPlan(network, env);
  const wasmPath = findFundsWasm();
  const wasmBytes = wasmPath ? loadWasm(wasmPath).bytes.length : 450_000;
  const b = fundsBudget(f, { wasmBytes, funds: FUND_LAUNCHES.length, managers: FUND_LAUNCHES.length, house: HOUSE_INVESTORS.length, network });
  const n = (v: bigint) => yoctoToNearString(v, 2);
  console.log(`Funds funding plan for ${network}${wasmPath ? "" : " (wasm not built: code size estimated at 440 KB)"}\n`);
  console.log("| Item | NEAR | Note |\n| --- | ---: | --- |");
  for (const r of b.rows) console.log(`| ${r.item} | ${n(r.near)} | ${r.note} |`);
  console.log(`| **Total** | **${n(b.total)}** | |`);
}

async function main(): Promise<void> {
  const network = currentNetwork();
  if (network === "mainnet") throw new Error("Refusing to deploy to mainnet from this repo.");
  if (process.argv.includes("--plan")) return printPlan(network);
  const log = createLogger("funds");
  log.step(`network ${network}`);
  const d = await deployFunds({ network, log, wasmWaitMs: waitMs(), skipHouse: process.argv.includes("--no-house") });
  if (!d.codeHash) {
    log.warn("contract not deployed yet (wasm missing); re-run once contracts/funds/res/*.wasm exists");
    process.exitCode = 2;
    return;
  }
  log.info(`wrote ${fundsDeploymentPath(network)}`);
  log.step(`done: ${d.funds.length} funds on ${d.contract}. Next: pnpm tsx scripts/funds-verify.ts`);
}

main().catch((err) => {
  console.error(`[funds] failed: ${(err as Error).message}`);
  process.exit(1);
});
