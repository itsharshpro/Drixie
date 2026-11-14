import type { Account } from "near-api-js";
import type { ChainClient } from "../client";
import type { FileKeyStore } from "../keystore";
import { yoctoToNearString } from "../units";
import type { Logger } from "./log";

export interface EnsureAccountOptions {
  client: ChainClient;
  keyStore: FileKeyStore;

  creator: Account;
  accountId: string;

  initial: bigint;

  topUpBelow?: bigint;
  log: Logger;
}

export async function ensureAccount(o: EnsureAccountOptions): Promise<Account> {
  const exists = await o.client.accountExists(o.accountId);
  if (!exists) {
    const { keyPair } = o.keyStore.getOrCreate(o.accountId, o.accountId);
    await o.client.createAccount(o.creator, o.accountId, keyPair.getPublicKey(), o.initial);
    o.log.info(`created ${o.accountId} with ${yoctoToNearString(o.initial, 2)} NEAR`);
    return signerFor(o);
  }
  const kp = o.keyStore.getKeyPair(o.accountId);
  if (!kp) {
    throw new Error(
      `${o.accountId} exists but its key is not in ${o.keyStore.dir}. Restore the key file, or reset the sandbox (./scripts/sandbox.sh reset).`,
    );
  }
  if (!(await o.client.hasAccessKey(o.accountId, kp.getPublicKey().toString()))) {
    throw new Error(`The key in ${o.keyStore.pathFor(o.accountId)} is not an access key of ${o.accountId}.`);
  }
  if (o.topUpBelow !== undefined) {
    const balance = await o.client.getBalance(o.accountId);
    if (balance < o.topUpBelow) {
      const amount = o.initial - balance;
      await o.client.transfer(o.creator, o.accountId, amount);
      o.log.info(`topped up ${o.accountId} by ${yoctoToNearString(amount, 2)} NEAR`);
    }
  }
  return signerFor(o);
}

function signerFor(o: EnsureAccountOptions): Account {
  if (o.client.keyStore?.dir === o.keyStore.dir) return o.client.account(o.accountId);
  return o.client.accountWithKey(o.accountId, o.keyStore.requireKeyPair(o.accountId));
}
