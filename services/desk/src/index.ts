import { runHouseInvestors } from "./funds/main";

runHouseInvestors().catch((err: unknown) => {
  console.error(`[desk] crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exit(1);
});
