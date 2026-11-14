import type { PublicConfig } from "@listed/shared";
import { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner, type KeyPairString } from "near-api-js";
import { keystore } from "./keystore";
import { MissingKeyError, TxError } from "./tx";

const providers = new Map<string, JsonRpcProvider>();
function provider(rpcUrl: string): JsonRpcProvider {
  let p = providers.get(rpcUrl);
  if (!p) {
    p = new JsonRpcProvider({ url: rpcUrl }, { retries: 2, wait: 300, backoff: 1.5 });
    providers.set(rpcUrl, p);
  }
  return p;
}

const text = (err: unknown) => `${(err as Error)?.constructor?.name ?? ""} ${err instanceof Error ? err.message : String(err)}`;

export function isValidAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id);
}

export async function accountExists(rpcUrl: string, accountId: string): Promise<boolean> {
  try {
    await provider(rpcUrl).viewAccount({ accountId, blockQuery: { finality: "optimistic" } });
    return true;
  } catch (err) {
    if (/AccountDoesNotExist|does not exist|UNKNOWN_ACCOUNT|doesn't exist/i.test(text(err))) return false;
    throw err;
  }
}

export interface TransferResult {
  txHash: string;
}

function plainTransferError(err: unknown): string {
  const t = text(err);
  if (/NotEnoughBalance|LackBalanceForState|not enough balance|balance/i.test(t)) {
    return "Your balance can't cover this amount plus the network fee. Try a smaller amount.";
  }
  if (/AccountDoesNotExist|does not exist|UNKNOWN_ACCOUNT/i.test(t)) return "That account doesn't exist on this network.";
  if (/AccessKeyDoesNotExist|access key/i.test(t)) return "This device's key isn't on your account any more. Sign in again on this device.";
  if (/fetch|network|ECONN|Failed to fetch|timeout/i.test(t)) return "Couldn't reach the NEAR network. Check your connection and try again.";
  return "The transfer didn't go through. Nothing was sent. Try again in a moment.";
}

export async function sendNearTransfer(opts: {
  config: PublicConfig;
  accountId: string;
  receiverId: string;
  yocto: bigint;
}): Promise<TransferResult> {
  const key = await keystore.get("accounts", opts.accountId);
  if (!key) throw new MissingKeyError();
  const signer = new KeyPairSigner(KeyPair.fromString(key.secretKey as KeyPairString));
  const account = new Account(opts.accountId, provider(opts.config.rpcUrl), signer);
  try {
    const res = await account.signAndSendTransaction({
      receiverId: opts.receiverId,
      actions: [actions.transfer(opts.yocto)],
      waitUntil: "EXECUTED_OPTIMISTIC",
    });
    const hash = (res as { transaction?: { hash?: string } }).transaction?.hash ?? "";
    return { txHash: hash };
  } catch (err) {
    const hash = (err as { transaction?: { hash?: string }; txHash?: string })?.txHash ?? null;
    throw new TxError(plainTransferError(err), text(err), hash);
  }
}

export function transferExplorerUrl(config: PublicConfig | undefined, txHash: string): string | null {
  if (!config || !txHash) return null;
  if (config.explorerTxUrl) {
    return config.explorerTxUrl.includes("{hash}") ? config.explorerTxUrl.replace("{hash}", txHash) : `${config.explorerTxUrl}${txHash}`;
  }
  if (config.network === "testnet") return `https://testnet.nearblocks.io/txns/${txHash}`;
  if (config.network === "mainnet") return `https://nearblocks.io/txns/${txHash}`;
  return null;
}
