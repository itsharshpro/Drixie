import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { ChainClient, FileKeyStore, describeFailure, env, yoctoToNearString } from "@listed/chain";
import { GasBudgets, ProvisionLimits } from "./budget";
import type { RelayerConfig } from "./config";
import { RelayerError } from "./errors";
import { FaucetLimits, registerFaucetRoute } from "./faucet";
import { forwardedIdentity, handleProvision, tokenMatches } from "./provision";
import { RateLimiter } from "./ratelimit";
import { handleRelay } from "./relay";
import { ReceiverRegistry } from "./registry";
import { Signers } from "./signers";

export interface RelayerApp {
  app: FastifyInstance;
  registry: ReceiverRegistry;
  signers: Signers;
  client: ChainClient;
}

export async function buildServer(config: RelayerConfig, opts: { logger?: boolean; keyStore?: FileKeyStore } = {}): Promise<RelayerApp> {
  const { chain } = config;
  const keyStore = opts.keyStore ?? FileKeyStore.forNetwork(chain.network);
  const client = new ChainClient(chain.rpcUrl, keyStore);

  const signers = new Signers(client, keyStore, chain.relayer, chain.players, {
    sharedPlayersKey: chain.network === "sandbox" || config.sharedPlayersKey,
  });

  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 128 * 1024,
  });

  const registry = new ReceiverRegistry({
    network: chain.network,
    root: chain.root,
    protocolAccounts: [chain.relayer, chain.players],
    fundsContract: env("FUNDS_CONTRACT") ?? null,
    client,
    refreshMs: config.registryRefreshMs,
    log: app.log,
  });

  const senderLimiter = new RateLimiter(config.rate.senderPerMinute, config.rate.senderBurst);
  const ipLimiter = new RateLimiter(config.rate.ipPerMinute, config.rate.ipBurst);
  const provisionLimiter = new RateLimiter(config.rate.provisionPerMinute, Math.max(1, Math.ceil(config.rate.provisionPerMinute / 3)));
  const gasBudgets = new GasBudgets(config.gasBudget.perSender, config.gasBudget.total);
  const provisionLimits = new ProvisionLimits(config.provision);
  const faucetLimits = new FaucetLimits(config.faucet);
  const faucetLimiter = new RateLimiter(config.rate.provisionPerMinute, Math.max(1, Math.ceil(config.rate.provisionPerMinute / 3)));
  const sweeper = setInterval(() => {
    senderLimiter.sweep();
    ipLimiter.sweep();
    provisionLimiter.sweep();
    gasBudgets.sweep();
    provisionLimits.sweep();
    faucetLimits.sweep();
    faucetLimiter.sweep();
  }, 60_000);
  sweeper.unref();

  const low = { relayer: false, players: false };
  const checkBalances = async () => {
    for (const [name, account] of [["relayer", chain.relayer], ["players", chain.players]] as const) {
      const bal = await client.getBalance(account).catch(() => null);
      if (bal === null) continue;
      const isLow = bal < config.lowBalance;
      if (isLow && !low[name]) app.log.warn({ account, balanceNear: yoctoToNearString(bal, 2), thresholdNear: yoctoToNearString(config.lowBalance, 2) }, `${name} balance is low: top it up`);
      if (!isLow && low[name]) app.log.info({ account, balanceNear: yoctoToNearString(bal, 2) }, `${name} balance is back above the alert threshold`);
      low[name] = isLow;
    }
  };
  const balanceTimer = setInterval(() => void checkBalances(), 5 * 60_000);
  balanceTimer.unref();
  void checkBalances();

  app.addHook("onClose", async () => {
    clearInterval(sweeper);
    clearInterval(balanceTimer);
    registry.stop();
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin) || chain.network === "sandbox") cb(null, true);
      else cb(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
  });

  const send = (reply: FastifyReply, status: number, body: unknown) => reply.code(status).send(body);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof RelayerError) {
      if (err.status === 429 && typeof err.extra.retryAfter === "number") reply.header("retry-after", String(err.extra.retryAfter));
      return send(reply, err.status, err.toBody());
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return send(reply, status, { error: { code: "bad_request", message: (err as Error).message } });
    }
    req.log.error({ err }, "relayer request failed");
    const human = describeFailure(err);
    return send(reply, 502, { error: { code: human.code, message: human.message } });
  });

  app.get("/health", async () => {
    let height: number | null = null;
    let relayerBalance: string | null = null;
    let playersBalance: string | null = null;
    let rpcOk = true;
    try {
      height = await client.blockHeight("final");
    } catch {
      rpcOk = false;
    }
    if (rpcOk) {
      relayerBalance = await client.getBalance(chain.relayer).then(String).catch(() => null);
      playersBalance = await client.getBalance(chain.players).then(String).catch(() => null);
    }
    let keyConfigured = true;
    try {
      signers.relayer();
    } catch {
      keyConfigured = false;
    }
    const ok = rpcOk && keyConfigured && registry.fundsContractLive;
    const lowBalance = (relayerBalance !== null && BigInt(relayerBalance) < config.lowBalance) || (playersBalance !== null && BigInt(playersBalance) < config.lowBalance);

    return {
      ok,
      network: chain.network,
      chainHead: height,
      root: chain.root,
      fundsContract: registry.fundsContract,
      fundsContractLive: registry.fundsContractLive,
      relayer: chain.relayer,
      relayerKeyConfigured: keyConfigured,
      relayerBalance,
      relayerBalanceNear: relayerBalance ? yoctoToNearString(relayerBalance, 2) : null,
      players: chain.players,
      playersBalanceNear: playersBalance ? yoctoToNearString(playersBalance, 2) : null,
      registryRefreshedAt: registry.lastRefresh ? new Date(registry.lastRefresh).toISOString() : null,
      starterBalanceNear: yoctoToNearString(config.starterBalance, 4),
      lowBalance,
      senders: config.senderSuffixes.length ? config.senderSuffixes : "any (sandbox)",
      gasBudget: {
        perSenderNear: config.gasBudget.perSender > 0n ? yoctoToNearString(config.gasBudget.perSender, 3) : "unlimited",
        totalNear: config.gasBudget.total > 0n ? yoctoToNearString(config.gasBudget.total, 2) : "unlimited",
        usedTodayNear: yoctoToNearString(gasBudgets.total.spent("all"), 4),
      },
      faucet: {
        dailyNear: config.provision.dailyFaucet > 0n ? yoctoToNearString(config.provision.dailyFaucet, 2) : "unlimited",
        usedTodayNear: yoctoToNearString(provisionLimits.faucet.spent("all"), 2),
      },
      topUps: {
        enabled: config.faucet.dailyBudget > 0n && config.serviceToken !== null && chain.network !== "mainnet",
        dailyNear: yoctoToNearString(config.faucet.dailyBudget, 2),
        maxPerRequestNear: yoctoToNearString(config.faucet.maxPerRequest, 4),
        usedTodayNear: yoctoToNearString(faucetLimits.spentToday(), 4),
        reasons: config.faucet.reasons,
      },
    };
  });

  app.post("/relay", async (req, reply) => {
    const wait = ipLimiter.take(`ip:${req.ip}`);
    if (wait > 0) {
      throw new RelayerError(429, "rate_limited", `Too many requests. Wait ${wait} s and try again.`, { retryAfter: wait });
    }
    const res = await handleRelay(req.body, { config, client, registry, signers, senderLimiter, gasBudgets, log: req.log });
    req.log.info(
      {
        status: res.status,
        txHash: res.body.txHash,
        sender: (res.body.outcome as { sender?: string } | undefined)?.sender,
        mode: (res.body.outcome as { mode?: string } | undefined)?.mode,
      },
      "relay",
    );
    return send(reply, res.status, res.body);
  });

  app.post("/provision", async (req, reply) => {

    const trusted = tokenMatches(req.headers["x-service-token"], config.serviceToken);
    const who = trusted ? forwardedIdentity(req.headers as Record<string, unknown>) : {};

    const buckets = [who.ip ? `fwd:${who.ip}` : `ip:${req.ip}`, ...(who.user ? [`user:${who.user}`] : [])];
    const wait = Math.max(...buckets.map((b) => provisionLimiter.take(b)));
    if (wait > 0) {
      throw new RelayerError(429, "rate_limited", `Too many sign-ups right now. Wait ${wait} s and try again.`, { retryAfter: wait });
    }
    const res = await handleProvision(req.headers["x-service-token"], req.body, {
      config: { serviceToken: config.serviceToken, starterBalance: config.starterBalance, network: chain.network, root: chain.root },
      client,
      signers,
      limits: provisionLimits,
      who,
      log: req.log,
    });
    req.log.info({ status: res.status, accountId: res.body.accountId, created: res.body.created }, "provision");
    return send(reply, res.status, res.body);
  });

  if (config.faucet.dailyBudget > 0n && chain.network !== "mainnet") registerFaucetRoute(app, {
    config: { ...config.faucet, serviceToken: config.serviceToken, network: chain.network, root: chain.root },
    client,
    signers,
    limits: faucetLimits,
    limiter: faucetLimiter,
    log: app.log,
  });

  await registry.refresh();
  registry.start();
  return { app, registry, signers, client };
}
