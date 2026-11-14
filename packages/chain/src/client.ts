import {
  Account,
  actions,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  PublicKey,
  type Action,
  type SerializedReturnValue,
  type TxExecutionStatus,
} from "near-api-js";
import { FileKeyStore } from "./keystore";
import { describeFailure, summarizeOutcome, type OutcomeSummary, type TxResultLike } from "./outcome";
import { DEFAULT_CALL_GAS } from "./units";

export type Amount = bigint | string | number;

export interface CallOptions {
  contractId: string;
  method: string;
  args?: Record<string, unknown> | Uint8Array;
  deposit?: Amount;
  gas?: Amount;
  waitUntil?: TxExecutionStatus;

  throwOnFailure?: boolean;
}

export interface TxResult<T = unknown> extends OutcomeSummary {
  returnValue: T;
  raw: TxResultLike;
}

export class ChainCallError extends Error {
  readonly code: string;
  readonly txHash: string;
  readonly outcome: OutcomeSummary;
  constructor(summary: OutcomeSummary) {
    super(summary.error?.message ?? "The transaction failed.");
    this.name = "ChainCallError";
    this.code = summary.error?.code ?? "tx_failed";
    this.txHash = summary.txHash;
    this.outcome = summary;
  }
}

export function createProvider(rpcUrl: string): JsonRpcProvider {
  return new JsonRpcProvider({ url: rpcUrl }, { retries: 4, wait: 300, backoff: 1.5 });
}

const toBig = (v: Amount | undefined, fallback: bigint): bigint => (v === undefined ? fallback : BigInt(v));

export interface SentTx {
  txHash: string;
  signer: string;
  receiver: string;

  label: string;
  status: OutcomeSummary["status"];
}

export function describeActions(txActions: Action[]): string {
  return txActions
    .map((a) => (a.functionCall ? a.functionCall.methodName : a.enum ?? Object.keys(a).find((k) => k !== "enum" && (a as unknown as Record<string, unknown>)[k] !== undefined) ?? "action"))
    .join("+");
}

export class ChainClient {
  readonly provider: JsonRpcProvider;
  private readonly accounts = new Map<string, Account>();

  onTx?: (tx: SentTx) => void;

  constructor(
    readonly rpcUrl: string,
    readonly keyStore?: FileKeyStore,
  ) {
    this.provider = createProvider(rpcUrl);
  }

  account(accountId: string, keyName: string = accountId): Account {
    const cacheKey = `${accountId}#${keyName}`;
    const cached = this.accounts.get(cacheKey);
    if (cached) return cached;
    if (!this.keyStore) throw new Error("ChainClient has no keystore; use accountWithKey()");
    const kp = this.keyStore.requireKeyPair(keyName);
    const acc = new Account(accountId, this.provider, new KeyPairSigner(kp));
    this.accounts.set(cacheKey, acc);
    return acc;
  }

  accountWithKey(accountId: string, keyPair: KeyPair): Account {
    const cacheKey = `${accountId}#pk:${keyPair.getPublicKey().toString()}`;
    const cached = this.accounts.get(cacheKey);
    if (cached) return cached;
    const acc = new Account(accountId, this.provider, new KeyPairSigner(keyPair));
    this.accounts.set(cacheKey, acc);
    return acc;
  }

  async view<T>(contractId: string, method: string, args: Record<string, unknown> = {}, finality: "optimistic" | "final" = "optimistic"): Promise<T> {
    const result = await this.provider.callFunction<SerializedReturnValue>({
      contractId,
      method,
      args,
      blockQuery: { finality },
    });
    return result as T;
  }

  async accountExists(accountId: string): Promise<boolean> {
    try {
      await this.provider.viewAccount({ accountId });
      return true;
    } catch (err) {
      if (isAccountMissing(err)) return false;
      throw err;
    }
  }

  async getBalance(accountId: string): Promise<bigint> {
    return new Account(accountId, this.provider).getBalance();
  }

  async getState(accountId: string) {
    return new Account(accountId, this.provider).getState();
  }

  async codeHash(accountId: string): Promise<string | null> {
    const view = await this.provider.viewAccount({ accountId });
    const hash = (view as unknown as { code_hash?: string; codeHash?: string }).code_hash ??
      (view as unknown as { codeHash?: string }).codeHash;
    if (!hash || hash === "11111111111111111111111111111111") return null;
    return hash;
  }

  async hasAccessKey(accountId: string, publicKey: string): Promise<boolean> {
    try {
      await this.provider.viewAccessKey({ accountId, publicKey });
      return true;
    } catch (err) {
      if (isAccountMissing(err) || isKeyMissing(err)) return false;
      throw err;
    }
  }

  async accessKeyMethods(accountId: string, publicKey: string): Promise<{ receiver: string; methods: string[] } | "full" | null> {
    try {
      const key = (await this.provider.viewAccessKey({ accountId, publicKey })) as unknown as { permission?: unknown };
      const perm = key.permission as
        | string
        | { FunctionCall?: { receiver_id?: string; receiverId?: string; method_names?: string[]; methodNames?: string[] } }
        | { functionCall?: { receiver_id?: string; receiverId?: string; method_names?: string[]; methodNames?: string[] } }
        | undefined;
      if (!perm || typeof perm === "string") return "full";
      const fc = ("FunctionCall" in perm ? perm.FunctionCall : undefined) ?? ("functionCall" in perm ? perm.functionCall : undefined);
      if (!fc) return "full";
      return { receiver: fc.receiver_id ?? fc.receiverId ?? "", methods: [...(fc.method_names ?? fc.methodNames ?? [])] };
    } catch (err) {
      if (isAccountMissing(err) || isKeyMissing(err)) return null;
      throw err;
    }
  }

  async replaceWithFunctionCallKey(
    account: Account,
    opts: { publicKey: string | PublicKey; contractId: string; methodNames: string[]; allowance?: Amount },
  ): Promise<TxResult> {
    const pk = PublicKey.from(opts.publicKey);
    return this.send(account, account.accountId, [
      actions.deleteKey(pk),
      actions.addFunctionCallAccessKey(pk, opts.contractId, opts.methodNames, opts.allowance === undefined ? undefined : BigInt(opts.allowance)),
    ]);
  }

  async blockHeight(finality: "optimistic" | "final" = "final"): Promise<number> {
    const block = await this.provider.viewBlock({ finality });
    return Number(block.header.height);
  }

  async chainId(): Promise<string> {
    return this.provider.getNetworkId();
  }

  async send(signer: Account, receiverId: string, txActions: Action[], opts: { waitUntil?: TxExecutionStatus; throwOnFailure?: boolean } = {}): Promise<TxResult> {
    const raw = (await signer.signAndSendTransaction({
      receiverId,
      actions: txActions,
      waitUntil: opts.waitUntil ?? "EXECUTED_OPTIMISTIC",
      throwOnFailure: false,
    })) as unknown as TxResultLike;
    const summary = summarizeOutcome(raw);
    this.onTx?.({ txHash: summary.txHash, signer: signer.accountId, receiver: receiverId, label: describeActions(txActions), status: summary.status });
    if (summary.status === "failure" && opts.throwOnFailure !== false) throw new ChainCallError(summary);
    return { ...summary, raw };
  }

  async call<T = unknown>(signer: Account, opts: CallOptions): Promise<TxResult<T>> {
    const action = actions.functionCall(
      opts.method,
      opts.args ?? {},
      toBig(opts.gas, DEFAULT_CALL_GAS),
      toBig(opts.deposit, 0n),
    );
    const res = await this.send(signer, opts.contractId, [action], opts);
    return res as TxResult<T>;
  }

  async createAccount(creator: Account, newAccountId: string, publicKey: string | PublicKey, amount: Amount): Promise<TxResult> {
    return this.send(creator, newAccountId, [
      actions.createAccount(),
      actions.transfer(BigInt(amount)),
      actions.addFullAccessKey(PublicKey.from(publicKey)),
    ]);
  }

  async transfer(from: Account, receiverId: string, amount: Amount): Promise<TxResult> {
    return this.send(from, receiverId, [actions.transfer(BigInt(amount))]);
  }

  async deployContract(account: Account, wasm: Uint8Array): Promise<TxResult> {
    return this.send(account, account.accountId, [actions.deployContract(wasm)], { waitUntil: "FINAL" });
  }

  async deployAndInit(account: Account, wasm: Uint8Array, init: { method: string; args: Record<string, unknown>; gas?: Amount }): Promise<TxResult> {
    return this.send(
      account,
      account.accountId,
      [actions.deployContract(wasm), actions.functionCall(init.method, init.args, toBig(init.gas, 100n * 10n ** 12n), 0n)],
      { waitUntil: "FINAL" },
    );
  }

  async deployGlobalContract(account: Account, wasm: Uint8Array, mode: "codeHash" | "accountId"): Promise<TxResult> {
    return this.send(account, account.accountId, [actions.deployGlobalContract(wasm, mode)], { waitUntil: "FINAL" });
  }

  async addFullAccessKey(account: Account, publicKey: string | PublicKey): Promise<TxResult> {
    return this.send(account, account.accountId, [actions.addFullAccessKey(PublicKey.from(publicKey))]);
  }

  async addFunctionCallKey(
    account: Account,
    opts: { publicKey: string | PublicKey; contractId: string; methodNames: string[]; allowance?: Amount },
  ): Promise<TxResult> {
    return this.send(account, account.accountId, [
      actions.addFunctionCallAccessKey(
        PublicKey.from(opts.publicKey),
        opts.contractId,
        opts.methodNames,
        opts.allowance === undefined ? undefined : BigInt(opts.allowance),
      ),
    ]);
  }

  async txStatus(txHash: string, senderId: string, waitUntil: TxExecutionStatus = "EXECUTED_OPTIMISTIC"): Promise<OutcomeSummary> {
    const raw = (await this.provider.viewTransactionStatus({ txHash, accountId: senderId, waitUntil })) as unknown as TxResultLike;
    return summarizeOutcome(raw);
  }

  async waitForRpc(timeoutMs = 60_000): Promise<number> {
    return waitForRpc(this.rpcUrl, timeoutMs);
  }
}

export async function waitForRpc(rpcUrl: string, timeoutMs = 60_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${rpcUrl.replace(/\/$/, "")}/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = (await res.json()) as { sync_info?: { latest_block_height?: number } };
        const h = body.sync_info?.latest_block_height ?? 0;
        if (h > 1) return h;
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const reason = lastErr instanceof Error ? ` (${lastErr.message})` : "";
  throw new Error(`NEAR RPC at ${rpcUrl} did not become ready within ${Math.round(timeoutMs / 1000)} s${reason}. Start it: ./scripts/sandbox.sh start`);
}

export function isAccountMissing(err: unknown): boolean {
  const e = err as { constructor?: { name?: string }; message?: string; type?: string };
  const text = `${e?.constructor?.name ?? ""} ${e?.type ?? ""} ${e?.message ?? ""}`;
  return /AccountDoesNotExist|UNKNOWN_ACCOUNT|does not exist/i.test(text);
}

export function isKeyMissing(err: unknown): boolean {
  const e = err as { constructor?: { name?: string }; message?: string; type?: string };
  const text = `${e?.constructor?.name ?? ""} ${e?.type ?? ""} ${e?.message ?? ""}`;
  return /AccessKeyDoesNotExist|UNKNOWN_ACCESS_KEY|access key .*does not exist/i.test(text);
}

export function humanError(err: unknown): { code: string; message: string } {
  if (err instanceof ChainCallError) return { code: err.code, message: err.message };
  return describeFailure(err instanceof Error ? err : new Error(String(err)));
}
