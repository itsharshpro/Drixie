import type { PublicConfig } from "@listed/shared";
import { getBalance, relay, signDelegateAction, view } from "@listed/chain/browser";
import type { FunctionCallSpec } from "./actions";
import { humanChainError } from "./errors";
import { keystore } from "./keystore";
import { findFailure, findReturnValue } from "./outcome";

export interface TxResult<R = unknown> {
  txHash: string;
  status: string;
  outcome: unknown;
  returnValue: R | null;
}

export class TxError extends Error {
  readonly raw: string;
  readonly txHash: string | null;
  constructor(message: string, raw: string, txHash: string | null = null) {
    super(message);
    this.name = "TxError";
    this.raw = raw;
    this.txHash = txHash;
  }
}

export class MissingKeyError extends Error {
  constructor() {
    super("This device doesn't have your account key yet. Import it in Settings to continue.");
    this.name = "MissingKeyError";
  }
}

export async function sendActions<R = unknown>(opts: {
  config: PublicConfig;
  accountId: string;
  receiverId: string;
  actions: FunctionCallSpec[];
}): Promise<TxResult<R>> {
  const key = await keystore.get("accounts", opts.accountId);
  if (!key) throw new MissingKeyError();

  let signedDelegate: string;
  try {
    signedDelegate = await signDelegateAction({
      accountId: opts.accountId,
      secretKey: key.secretKey,
      rpcUrl: opts.config.rpcUrl,
      receiverId: opts.receiverId,
      actions: opts.actions,
    });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);

    throw new TxError(/not registered on/.test(msg) ? msg.replace(/\s*\(.*\)\s*$/, "") : humanChainError(err), msg);
  }

  let res: { txHash: string; status: string; outcome: unknown };
  try {
    res = await relay(opts.config.relayerUrl, signedDelegate);
  } catch (err) {
    const e = err as { name?: string; message?: string; txHash?: string; outcome?: unknown };
    const raw = e.outcome ? (findFailure(e.outcome) ?? e.message ?? "") : (e.message ?? String(err));

    const mapped = humanChainError(raw);
    const message = e.name === "RelayError" && mapped.startsWith("That didn't go through") && e.message ? e.message : mapped;
    throw new TxError(message, raw, e.txHash ?? null);
  }

  const failure = findFailure(res.outcome) ?? (/fail|error/i.test(res.status ?? "") ? res.status : null);
  if (failure) throw new TxError(humanChainError(failure), failure, res.txHash);

  return { ...res, returnValue: findReturnValue<R>(res.outcome, opts.receiverId) };
}

export async function viewCall<T>(config: PublicConfig, contractId: string, method: string, args: object = {}): Promise<T> {
  return view<T>(config.rpcUrl, contractId, method, args);
}

export async function accountBalance(config: PublicConfig, accountId: string): Promise<string> {
  return getBalance(config.rpcUrl, accountId);
}

export function explorerUrl(config: PublicConfig | undefined, txHash: string): string | null {
  if (!config?.explorerTxUrl || !txHash) return null;
  return config.explorerTxUrl.includes("{hash}") ? config.explorerTxUrl.replace("{hash}", txHash) : `${config.explorerTxUrl}${txHash}`;
}
