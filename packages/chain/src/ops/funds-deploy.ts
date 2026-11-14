import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { KeyPair, type Account, type KeyPairString } from "near-api-js";
import { FUND_COLORS, type Network, type SeedFundId } from "@listed/shared";
import { ChainClient, isAccountMissing } from "../client";
import { readDeployment } from "../deployment";
import { env } from "../env";
import { FileKeyStore } from "../keystore";
import { keysDir, repoRoot } from "../paths";
import { tgas, yoctoToNearString } from "../units";
import { readFundsDeployment, writeFundsDeployment, managersKeysDir, navKeysDir, type FundsDeployment, type FundsHouseEntry, type FundsManagerEntry } from "../funds/deployment";
import { fundsFundingPlan, type FundsFunding } from "../funds/funding";
import { FUND_MANAGER_METHODS, FUND_OPERATOR_METHODS } from "../funds/methods";
import {
  DEFAULT_GAME_USD_PER_NEAR,
  seasonConfig,
  FUND_LAUNCHES,
  FUNDS_UNIVERSE,
  HOUSE_INVESTORS,
  fundsOperatorId,
  houseInvestorId,
  managerAccountId,
  managersParentId,
  type SeasonConfig,
} from "../funds/params";
import { ensureAccount } from "./accounts";
import { sleep, type Logger } from "./log";
import { loadWasm, type WasmFile } from "./wasm";

export interface FundsDeployOptions {
  network: Network;
  log: Logger;

  wasmWaitMs: number;

  skipHouse?: boolean;
}

const rel = (p: string) => relative(repoRoot(), p);

export function findFundsWasm(): string | null {
  const forced = env("FUNDS_WASM");
  if (forced) return forced.startsWith("/") ? forced : join(repoRoot(), forced);
  const dirs = [join(repoRoot(), "contracts", "funds", "res"), join(repoRoot(), "contracts", "res")];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".wasm") && (dir.includes("funds") || f.includes("funds")))
      .map((f) => join(dir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (files[0]) return files[0];
  }
  return null;
}

async function waitForFundsWasm(ms: number, log: Logger): Promise<WasmFile | null> {
  const deadline = Date.now() + ms;
  let said = false;
  for (;;) {
    const p = findFundsWasm();
    if (p && statSync(p).size > 0) {
      const a = statSync(p).size;
      await sleep(1500);
      if (statSync(p).size === a) return loadWasm(p);
    }
    if (Date.now() >= deadline) return null;
    if (!said) {
      log.info(`waiting for contracts/funds/res/*.wasm (up to ${Math.round(ms / 60_000)} min)…`);
      said = true;
    }
    await sleep(10_000);
  }
}

function seasonFromEnv(): SeasonConfig {
  const n = (k: string): number | undefined => {
    const v = Number(env(k));
    return env(k) !== undefined && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
  };
  return seasonConfig({
    bellSecs: n("FUNDS_BELL_SECS"),
    quarterSecs: n("FUNDS_QUARTER_SECS"),
    quarters: n("FUNDS_QUARTERS"),
    revealSecs: n("FUNDS_REVEAL_SECS"),
    auctionSecs: n("FUNDS_AUCTION_SECS"),
  });
}

function deployer(network: Network, client: ChainClient, keyStore: FileKeyStore): Account {
  if (network === "sandbox") {
    if (!keyStore.has("test.near")) throw new Error("Missing .data/keys/sandbox/test.near.json. Start the node first: ./scripts/sandbox.sh start");
    return client.account("test.near");
  }
  if (network === "mainnet") throw new Error("Mainnet deployment is disabled in this repo.");
  const id = env("NEAR_ACCOUNT_ID");
  const key = env("NEAR_PRIVATE_KEY");
  if (!id || !key) throw new Error("Testnet deploy needs NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY in the env file (LISTED_ENV_FILE=.env.testnet).");
  return client.accountWithKey(id, KeyPair.fromString(key as KeyPairString));
}

export function fundsContractId(network: Network): string {
  const forced = env("FUNDS_CONTRACT");
  if (forced) return forced;
  if (network === "sandbox") return "drixie.test.near";
  const id = env("NEAR_ACCOUNT_ID");
  if (!id) throw new Error("Set NEAR_ACCOUNT_ID (e.g. drixie.testnet): the funds contract lives on the root account.");
  return id;
}

async function ensureFunctionCallKey(
  client: ChainClient,
  account: Account,
  store: FileKeyStore,
  receiverId: string,
  methodNames: string[],
  allowance: bigint | undefined,
  log: Logger,
): Promise<KeyPair> {
  const { keyPair } = store.getOrCreate(account.accountId, account.accountId);
  const pk = keyPair.getPublicKey().toString();
  const current = await client.accessKeyMethods(account.accountId, pk);
  const label = methodNames.length ? methodNames.join(", ") : "any method, no deposit";
  if (current === null) {
    await client.addFunctionCallKey(account, { publicKey: pk, contractId: receiverId, methodNames, allowance });
    log.info(`function-call key on ${account.accountId} → ${receiverId} (${label})`);
  } else if (current !== "full" && !sameMethods(current, receiverId, methodNames)) {

    await client.replaceWithFunctionCallKey(account, { publicKey: pk, contractId: receiverId, methodNames, allowance });
    log.warn(`function-call key on ${account.accountId} narrowed to ${receiverId} (${label})`);
  }
  return keyPair;
}

function sameMethods(current: { receiver: string; methods: string[] }, receiverId: string, methodNames: string[]): boolean {
  if (current.receiver !== receiverId) return false;
  const a = [...current.methods].sort();
  const b = [...methodNames].sort();
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

async function contractInitialized(client: ChainClient, contract: string): Promise<boolean> {
  try {
    await client.view(contract, "get_config");
    return true;
  } catch (err) {
    if (isAccountMissing(err)) throw err;
    return false;
  }
}

async function fundExists(client: ChainClient, contract: string, fund: string): Promise<boolean> {
  try {
    const f = await client.view<unknown>(contract, "get_fund", { fund });
    return f !== null && f !== undefined;
  } catch {
    return false;
  }
}

export async function deployFunds(o: FundsDeployOptions): Promise<FundsDeployment> {
  const { network, log } = o;
  if (network === "mainnet") throw new Error("Refusing to deploy to mainnet from this repo.");
  const keyStore = FileKeyStore.forNetwork(network);
  const legacy = readDeployment(network);
  const rpcUrl = env("NEAR_RPC_URL") ?? legacy?.rpcUrl ?? (network === "sandbox" ? "http://127.0.0.1:3030" : "https://rpc.testnet.fastnear.com");
  const client = new ChainClient(rpcUrl, keyStore);

  client.onTx = (t) => log.info(`tx ${t.txHash} ${t.signer} → ${t.receiver} ${t.label}${t.status === "failure" ? " FAILED" : ""}`);
  const fund: FundsFunding = fundsFundingPlan(network, env);
  const season = seasonFromEnv();
  const gameUsdPerNear = Number(env("GAME_USD_PER_NEAR") ?? DEFAULT_GAME_USD_PER_NEAR);

  log.step(`waiting for RPC ${rpcUrl}`);
  const height = await client.waitForRpc(network === "sandbox" ? 60_000 : 20_000);
  const chainId = await client.chainId();
  log.info(`chain ${chainId} at height ${height}`);

  const contractId = fundsContractId(network);
  const previous = readFundsDeployment(network);
  const same = previous && previous.contract === contractId && previous.chainId === chainId;
  const boss = deployer(network, client, keyStore);

  log.step(`contract account ${contractId} (deployer ${boss.accountId})`);
  let root: Account;
  const poolsTotal = fund.pool * BigInt(FUND_LAUNCHES.length);
  if (contractId === boss.accountId) {
    root = boss;
  } else if (contractId.endsWith(`.${boss.accountId}`)) {
    root = await ensureAccount({
      client, keyStore, creator: boss, accountId: contractId,
      initial: fund.contract + poolsTotal + fund.reserve + fund.operator + fund.managersParent + fund.manager * 5n + fund.house * BigInt(HOUSE_INVESTORS.length),
      log,
    });
  } else {
    throw new Error(`FUNDS_CONTRACT (${contractId}) must equal the deployer or be a sub-account of ${boss.accountId}.`);
  }

  const startBlock = same && previous?.startBlock ? previous.startBlock : await client.blockHeight("final");
  const child = (accountId: string, initial: bigint, store: FileKeyStore = keyStore) =>
    ensureAccount({ client, keyStore: store, creator: root, accountId, initial, topUpBelow: network === "sandbox" ? initial / 2n : undefined, log });

  log.step("operator, managers, house investors");
  const operatorId = fundsOperatorId(contractId);
  const operator = await child(operatorId, fund.operator);
  const navStore = new FileKeyStore(navKeysDir(network));
  const opKey = await ensureFunctionCallKey(client, operator, navStore, contractId, [...FUND_OPERATOR_METHODS], undefined, log);

  const parentId = managersParentId(contractId);

  const parent = await ensureAccount({
    client, keyStore, creator: root, accountId: parentId,
    initial: fund.managersParent + fund.manager * BigInt(FUND_LAUNCHES.length),
    topUpBelow: undefined, log,
  });
  for (const f of FUND_LAUNCHES) {

    if (!(await client.accountExists(managerAccountId(f.id, contractId))) && (await client.getBalance(parentId)) < fund.manager + fund.managersParent / 2n) {
      await client.transfer(root, parentId, fund.manager);
    }
  }
  const mgrStore = new FileKeyStore(managersKeysDir(network));
  const managers: FundsManagerEntry[] = [];
  for (const f of FUND_LAUNCHES) {
    const id = managerAccountId(f.id, contractId);
    const acct = await ensureAccount({ client, keyStore, creator: parent, accountId: id, initial: fund.manager, topUpBelow: undefined, log });
    if (network === "sandbox") {
      const bal = await client.getBalance(id);
      if (bal < fund.manager / 2n) await client.transfer(root, id, fund.manager - bal);
    }

    const kp = await ensureFunctionCallKey(client, acct, mgrStore, contractId, [...FUND_MANAGER_METHODS], undefined, log);
    managers.push({ fund: f.id, account: id, publicKey: kp.getPublicKey().toString(), keyFile: rel(mgrStore.pathFor(id)), methods: [...FUND_MANAGER_METHODS] });
  }

  const houseStore = new FileKeyStore(join(keysDir(network), "house"));
  const house: FundsHouseEntry[] = [];
  for (const h of HOUSE_INVESTORS) {
    const id = houseInvestorId(h.name, contractId);
    await child(id, fund.house, houseStore);
    house.push({ name: h.name, account: id, rule: h.rule, keyFile: rel(houseStore.pathFor(id)) });
  }

  let relayer = legacy?.relayer ?? `relayer.${contractId}`;
  let players = legacy?.players ?? `players.${contractId}`;
  if (network !== "sandbox") {
    relayer = `relayer.${contractId}`;
    players = `players.${contractId}`;
    if (fund.relayer > 0n) await child(relayer, fund.relayer);
    if (fund.players > 0n) await child(players, fund.players);
  }

  let deployment: FundsDeployment = {
    network,
    rpcUrl,
    chainId,
    contract: contractId,
    owner: contractId,
    operator: {
      account: operatorId,
      accountId: operatorId,
      publicKey: opKey.getPublicKey().toString(),
      keyFile: rel(navStore.pathFor(operatorId)),
      fullKeyFile: rel(keyStore.pathFor(operatorId)),
    },
    roles: { operator: operatorId, owner: contractId },
    managersParent: parentId,
    managers,
    funds: same ? (previous?.funds ?? []) : [],
    house,
    relayer,
    players,
    gameUsdPerNear,
    season,
    reserveNear: fund.reserve.toString(),
    startBlock,
    codeHash: same ? (previous?.codeHash ?? null) : null,
    wasm: same ? (previous?.wasm ?? null) : null,
    deployedAt: (same && previous?.deployedAt) || new Date().toISOString(),
    seeded: same ? (previous?.seeded ?? {}) : {},
  };

  if (same && previous?.codeHash) writeFundsDeployment(deployment);

  const wasm = await waitForFundsWasm(o.wasmWaitMs, log);
  if (!wasm) {
    log.warn("contracts/funds/res/*.wasm not found yet: accounts and keys are ready, the contract is not deployed (deployment file not written)");
    return deployment;
  }
  log.step(`contract code ${rel(wasm.path)} (${(wasm.bytes.length / 1024).toFixed(0)} KB, ${wasm.hash.slice(0, 10)}…)`);
  const initArgs = {
    owner: contractId,
    operator: operatorId,
    game_usd_per_near: gameUsdPerNear,
    season: {
      bell_secs: season.bellSecs,
      quarter_secs: season.quarterSecs,
      quarters: season.quarters,
      reveal_secs: season.revealSecs,
      auction_secs: season.auctionSecs,
    },
  };
  const deployed = await client.codeHash(contractId);
  if (!deployed) {
    await client.deployAndInit(root, wasm.bytes, { method: "new", args: initArgs, gas: tgas(100) });
    log.info(`deployed and initialized ${contractId}`);
  } else {
    if (deployed !== wasm.hash) {
      await client.deployContract(root, wasm.bytes);
      log.warn(`updated ${contractId} code ${deployed.slice(0, 10)}… → ${wasm.hash.slice(0, 10)}… (state kept)`);
    }
    if (!(await contractInitialized(client, contractId))) {
      await client.call(root, { contractId, method: "new", args: initArgs, gas: tgas(100) });
      log.info(`initialized ${contractId}`);
    }
  }
  deployment = { ...deployment, codeHash: wasm.hash, wasm: rel(wasm.path) };
  writeFundsDeployment(deployment);

  const mediaBase = `${(env("PUBLIC_API_URL") ?? env("API_URL") ?? "http://localhost:4000").replace(/\/+$/, "")}/v1/nft`;
  const cfg = await client.view<{ media_base?: string | null }>(contractId, "get_config").catch(() => null);
  if (cfg && cfg.media_base !== mediaBase) {
    await client.call(root, { contractId, method: "set_media_base", args: { media_base: mediaBase }, gas: tgas(30) });
    log.info(`NFT media base → ${mediaBase}`);
  }

  const onChainUniverse = await client.view<{ id?: string }[]>(contractId, "get_universe").catch(() => []);
  const onChainIds = new Set(Array.isArray(onChainUniverse) ? onChainUniverse.map((a) => a?.id) : []);
  if (FUNDS_UNIVERSE.some((a) => !onChainIds.has(a.id))) {
    await client.call(root, {
      contractId,
      method: "set_universe",
      args: { assets: FUNDS_UNIVERSE.map((a) => ({ id: a.id, basket: a.basket, kind: a.kind, region: a.region })) },
      gas: tgas(200),
    });
    log.info(`universe set: ${FUNDS_UNIVERSE.length} assets in ${new Set(FUNDS_UNIVERSE.map((a) => a.basket)).size} baskets`);
  } else log.info(`universe already set (${onChainUniverse.length} assets)`);
  deployment.seeded = { ...deployment.seeded, universe: true };
  writeFundsDeployment(deployment);

  log.step(`five funds (pool ${yoctoToNearString(fund.pool, 2)} NEAR each at NAV $10)`);
  const funds = [];
  for (const f of FUND_LAUNCHES) {
    const manager = managerAccountId(f.id, contractId);
    if (!(await fundExists(client, contractId, f.id))) {
      await client.call(root, {
        contractId,
        method: "create_fund",

        args: {
          id: f.id,
          name: f.name,
          mandate: f.mandate,
          caps: { startup_cap_bps: f.startupCapBps, basket_cap_bps: f.basketCapBps, turnover_bps: f.turnoverAllowancePct * 100 },
          manager,
          seed_usd: (BigInt(f.seedUsd) * 1_000_000n).toString(),
          pool_near: fund.pool.toString(),
        },
        deposit: fund.pool,
        gas: tgas(150),
      });
      log.info(`created ${f.name} (${f.mandate}), manager ${manager}, seed $${f.seedUsd.toLocaleString("en-US")}`);
    }
    funds.push({ id: f.id, name: f.name, mandate: f.mandate, manager, seedUsd: f.seedUsd, poolNear: fund.pool.toString(), color: FUND_COLORS[f.id as SeedFundId] });
  }
  deployment = { ...deployment, funds, seeded: { ...deployment.seeded, funds: funds.map((f) => f.id) } };
  writeFundsDeployment(deployment);

  for (const f of FUND_LAUNCHES) {
    const view = await client.view<{ crypto_cap_bps?: number } | null>(contractId, "get_fund", { fund: f.id }).catch(() => null);
    if (view && view.crypto_cap_bps === undefined) {
      log.warn(`contract code has no crypto caps yet; skipping set_crypto_cap for ${f.id}`);
      continue;
    }
    if (view && view.crypto_cap_bps !== f.cryptoCapBps) {
      await client.call(root, { contractId, method: "set_crypto_cap", args: { fund: f.id, bps: f.cryptoCapBps }, gas: tgas(30) });
      log.info(`crypto cap ${f.name}: ${f.cryptoCapBps} bps`);
    }
  }

  const vault = await client.view<{ reserve?: string }>(contractId, "get_vault").catch(() => null);
  if (vault && BigInt(vault.reserve ?? "0") < fund.reserve) {
    const missing = fund.reserve - BigInt(vault.reserve ?? "0");
    await client.call(root, { contractId, method: "fund_reserve", args: {}, deposit: missing, gas: tgas(30) });
    log.info(`vault reserve +${yoctoToNearString(missing, 2)} NEAR`);
  }

  await ensureSolvent(client, boss, contractId, network, log);

  const auctions: string[] = [];
  for (const f of FUND_LAUNCHES) {
    const a = await client.view<{ settled?: boolean; ends_at_ns?: string } | null>(contractId, "get_seat_auction", { fund: f.id }).catch(() => null);
    if (a && !a.settled) auctions.push(f.id);
  }
  if (auctions.length) log.info(`seat auctions open: ${auctions.join(", ")}`);
  deployment.seeded = { ...deployment.seeded, auctions };
  writeFundsDeployment(deployment);

  if (!o.skipHouse && fund.houseSubscription > 0n) {
    const done = new Set(deployment.seeded?.houseSubscriptions ?? []);
    for (const h of house) {
      if (done.has(h.account)) continue;
      const signer = client.accountWithKey(h.account, houseStore.requireKeyPair(h.account));
      const targets = openingTargets(h.name);

      const pending = await client.view<{ fund: string; side: string }[]>(contractId, "get_orders", { account: h.account }).catch(() => []);
      const queued = new Set((Array.isArray(pending) ? pending : []).filter((p) => p.side === "subscribe").map((p) => p.fund));
      let placed = 0;
      for (const t of targets) {
        if (queued.has(t)) continue;
        const held = await client.view<string>(contractId, "mt_balance_of", { account_id: h.account, token_id: t }).catch(() => "0");
        if (BigInt(held || "0") > 0n) continue;

        await client.call(signer, { contractId, method: "subscribe", args: { fund: t }, deposit: fund.houseSubscription, gas: tgas(30) });
        placed++;
      }
      done.add(h.account);
      log.info(`${h.account} buy-ins of ${yoctoToNearString(fund.houseSubscription, 2)} NEAR in ${targets.join(", ") || "none (pools only)"} (${placed} placed now)`);
      deployment.seeded = { ...deployment.seeded, houseSubscriptions: [...done] };
      writeFundsDeployment(deployment);
    }
  }

  const opSigner = client.accountWithKey(operatorId, navStore.requireKeyPair(operatorId));
  for (const f of FUND_LAUNCHES) {
    const salt = fundDnaSalt(network, f.id);

    const onChain = await client.view<{ dna?: { commit?: string | null } | null } | null>(contractId, "get_fund", { fund: f.id }).catch(() => null);
    if (onChain?.dna?.commit === salt.commit) continue;
    try {
      await client.call(opSigner, { contractId, method: "seal_dna", args: { fund: f.id, commit: salt.commit }, gas: tgas(30) });
      log.info(`DNA sealed for ${f.name} (commit ${salt.commit.slice(0, 10)}…)`);
    } catch (err) {
      const msg = (err as Error).message;
      if (!/already sealed/i.test(msg)) log.warn(`DNA for ${f.name}: ${msg}`);
    }
  }

  await ensureSolvent(client, boss, contractId, network, log);
  const bal = await client.getBalance(contractId);
  log.info(`${contractId} balance ${yoctoToNearString(bal, 2)} NEAR`);
  return deployment;
}

interface VaultBuckets {
  balance: string;
  vaults: string;
  reserve: string;
  pending_subscriptions: string;
  pools: string;
  protocol_fees: string;
  auction_escrow: string;
}

export async function ensureSolvent(client: ChainClient, payer: Account, contractId: string, network: Network, log: Logger): Promise<void> {
  const v = await client.view<VaultBuckets>(contractId, "get_vault").catch(() => null);
  if (!v) return;
  const owed = [v.vaults, v.reserve, v.pending_subscriptions, v.pools, v.protocol_fees, v.auction_escrow].reduce((a, x) => a + BigInt(x ?? "0"), 0n);
  const slack = network === "sandbox" ? 20n * 10n ** 24n : 10n ** 24n / 2n;

  const gross = BigInt(v.balance);
  const spendable = await client.getBalance(contractId).catch(() => gross);
  const have = spendable < gross ? spendable : gross;
  if (have >= owed + slack) {
    log.info(`solvent: ${yoctoToNearString(have, 2)} NEAR free vs ${yoctoToNearString(owed, 2)} NEAR owed`);
    return;
  }
  const missing = owed + slack - have;
  if (network === "sandbox" && payer.accountId !== contractId) {
    await client.transfer(payer, contractId, missing);
    log.info(`topped up ${contractId} by ${yoctoToNearString(missing, 2)} NEAR so its balance covers pools + reserve + pending buy-ins`);
    return;
  }
  throw new Error(`${contractId} holds ${yoctoToNearString(have, 2)} NEAR free but owes ${yoctoToNearString(owed, 2)} NEAR (pools + reserve + pending). Send ${yoctoToNearString(missing, 2)} NEAR to it and re-run.`);
}

export function fundDnaSalt(network: Network, fund: string): { salt: string; commit: string; path: string } {
  const dir = join(keysDir(network), "dna", "funds");
  const path = join(dir, `${fund}.json`);
  if (existsSync(path)) {
    const j = JSON.parse(readFileSync(path, "utf8")) as { salt: string; commit: string };
    return { ...j, path };
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const bytes = randomBytes(32);
  const body = { salt: bytes.toString("hex"), commit: createHash("sha256").update(bytes).digest("hex") };
  writeFileSync(path, JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
  return { ...body, path };
}

function openingTargets(name: string): string[] {
  switch (name) {
    case "chaser":
      return ["nova", "kite"];
    case "prudent":
      return ["atlas", "meridian", "nova", "orion", "kite"];
    case "planner":
      return ["atlas", "meridian", "nova"];
    default:
      return []; // arb trades pools only
  }
}
