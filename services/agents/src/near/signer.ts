import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";
import { Mutex, errMsg } from "../util/async.js";
import { eventsFromOutcome, successValue, type NepEvent } from "./events.js";

export const TGAS = 1_000_000_000_000n;

export interface CallOpts {
  gasTgas?: number;
  deposit?: bigint;
}

export interface TxResult<T = unknown> {
  txHash: string;
  value: T | undefined;
  events: NepEvent[];

  failedReceipts: string[];
}

export class TxError extends Error {
  constructor(
    readonly method: string,
    readonly contractId: string,
    message: string,
  ) {
    super(`${contractId}.${method} failed: ${message}`);
  }
}

export interface ChainSigner {
  readonly accountId: string;
  call<T = unknown>(contractId: string, method: string, args: object, opts?: CallOpts): Promise<TxResult<T>>;
}

export class NearSigner implements ChainSigner {
  private readonly account: Account;
  private readonly mutex = new Mutex();

  constructor(
    readonly accountId: string,
    rpcUrl: string,
    privateKey: string,
  ) {
    const provider = new JsonRpcProvider({ url: rpcUrl });
    this.account = new Account(accountId, provider, privateKey as KeyPairString);
  }

  call<T = unknown>(contractId: string, method: string, args: object, opts: CallOpts = {}): Promise<TxResult<T>> {
    return this.mutex.run(async () => {
      try {
        const res = await this.account.callFunctionRaw({
          contractId,
          methodName: method,
          args,
          gas: TGAS * BigInt(opts.gasTgas ?? 30),
          deposit: opts.deposit ?? 0n,
        });
        const outcome = res as unknown as {
          status: unknown;
          transaction?: { hash?: string };
          transaction_outcome?: { id: string; outcome: { logs: string[]; executor_id: string } };
          receipts_outcome?: { outcome: { logs: string[]; executor_id: string; status?: unknown } }[];
        };
        const failure = topFailure(outcome.status);
        if (failure) throw new TxError(method, contractId, failure);
        return {
          txHash: outcome.transaction?.hash ?? outcome.transaction_outcome?.id ?? "",
          value: successValue<T>(outcome.status),
          events: eventsFromOutcome(outcome),
          failedReceipts: receiptFailures(outcome.receipts_outcome),
        };
      } catch (e) {
        if (e instanceof TxError) throw e;
        throw new TxError(method, contractId, errMsg(e));
      }
    });
  }
}

function topFailure(status: unknown): string | null {
  if (status && typeof status === "object" && "Failure" in status) {
    return JSON.stringify((status as { Failure: unknown }).Failure);
  }
  return null;
}

function receiptFailures(receipts: { outcome: { status?: unknown } }[] | undefined): string[] {
  const out: string[] = [];
  for (const r of receipts ?? []) {
    const f = topFailure(r.outcome.status);
    if (f) out.push(f);
  }
  return out;
}
