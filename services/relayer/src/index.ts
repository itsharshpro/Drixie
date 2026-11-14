import { loadRelayerConfig } from "./config";
import { buildServer } from "./server";

async function main(): Promise<void> {
  const config = loadRelayerConfig();
  const { app, registry } = await buildServer(config);
  if (!config.serviceToken) app.log.warn("SERVICE_TOKEN is not set: POST /provision will reject every request");
  if (config.ignoredSenderSuffixes.length) {
    app.log.warn({ ignored: config.ignoredSenderSuffixes, allowed: config.senderSuffixes }, "RELAYER_SENDER_SUFFIXES entries outside players.<root> are ignored off the sandbox");
  }
  if (!registry.fundsContractLive) {
    app.log.warn({ fundsContract: registry.fundsContract, error: registry.lastError }, "funds contract not reachable yet; relaying waits until it is deployed");
  }
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    { network: config.chain.network, root: config.chain.root, relayer: config.chain.relayer, fundsContract: registry.fundsContract },
    "relayer ready",
  );

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(`[relayer] failed to start: ${(err as Error).message}`);
  process.exit(1);
});
