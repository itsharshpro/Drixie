import { currentNetwork, deploymentPath } from "../packages/chain/src/index";
import { deployLocal } from "../packages/chain/src/ops/deploy";
import { createLogger } from "../packages/chain/src/ops/log";

async function main(): Promise<void> {
  const network = currentNetwork();
  const log = createLogger("deploy");
  log.step(`network ${network}`);
  const { deployment } = await deployLocal({ network, log });
  log.info(`wrote ${deploymentPath(network)} (startBlock ${deployment.startBlock})`);
  log.step("done. Next: pnpm tsx scripts/deploy-funds.ts");
}

main().catch((err) => {
  console.error(`[deploy] failed: ${(err as Error).message}`);
  process.exit(1);
});
