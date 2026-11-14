export class RpcError extends Error {
  constructor(
    message: string,
    readonly causeName: string | null,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export type BlockRef = { finality: "final" | "optimistic" } | { block_id: number | string };

export interface BlockHeader {
  height: number;
  hash: string;
  prev_hash: string;
  timestamp: number;
  timestamp_nanosec: string;
}

export interface ChunkHeader {
  chunk_hash: string;
  height_included: number;
  shard_id: number;
}

export interface BlockView {
  author: string;
  header: BlockHeader;
  chunks: ChunkHeader[];
}

export interface Action {
  [kind: string]: unknown;
}

export interface TxView {
  hash: string;
  signer_id: string;
  receiver_id: string;
  actions: (Action | string)[];
}

export interface ChunkReceiptView {
  predecessor_id: string;
  receiver_id: string;
  receipt_id: string;
  receipt: {
    Action?: { signer_id?: string; actions: (Action | string)[] };
    Data?: unknown;
    [kind: string]: unknown;
  };
}

export interface ChunkView {
  header: ChunkHeader;
  transactions: TxView[];
  receipts?: ChunkReceiptView[];
}

export interface ExecutionOutcome {
  logs: string[];
  receipt_ids: string[];
  gas_burnt: number;
  tokens_burnt: string;
  executor_id: string;
  status: Record<string, unknown> | string;
}

export interface OutcomeWithId {
  id: string;
  block_hash: string;
  outcome: ExecutionOutcome;
}

export interface ReceiptView {
  predecessor_id: string;
  receiver_id: string;
  receipt_id: string;
}

export interface TxStatus {
  final_execution_status?: string;
  status: Record<string, unknown>;
  transaction: TxView;
  transaction_outcome: OutcomeWithId;
  receipts_outcome: OutcomeWithId[];
  receipts?: ReceiptView[];
}

export interface AccountView {
  amount: string;
  locked: string;
  storage_usage: number;
  block_height: number;
}

export interface NearRpcOptions {
  timeoutMs?: number;
  retries?: number;
}

export class NearRpc {
  private id = 0;
  constructor(
    readonly url: string,
    private readonly opts: NearRpcOptions = {},
  ) {}

  async call<T>(method: string, params: unknown): Promise<T> {
    const retries = this.opts.retries ?? 2;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.once<T>(method, params);
      } catch (err) {
        lastErr = err;

        if (err instanceof RpcError && err.causeName !== "TIMEOUT_ERROR") throw err;
        if (attempt < retries) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  private async once<T>(method: string, params: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 15_000);
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
        signal: ctrl.signal,
      });
      if (!res.ok && res.status !== 200) {
        const text = await res.text().catch(() => "");

        try {
          const body = JSON.parse(text) as { error?: RawRpcError };
          if (body.error) throw toRpcError(body.error);
        } catch (e) {
          if (e instanceof RpcError) throw e;
        }
        throw new Error(`NEAR RPC ${method} failed with HTTP ${res.status}`);
      }
      const body = (await res.json()) as { result?: T; error?: RawRpcError };
      if (body.error) throw toRpcError(body.error);
      return body.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  status(): Promise<{ sync_info: { latest_block_height: number; latest_block_hash: string }; chain_id: string }> {
    return this.call("status", []);
  }

  block(ref: BlockRef): Promise<BlockView> {
    return this.call("block", ref);
  }

  chunk(chunkId: string): Promise<ChunkView> {
    return this.call("chunk", { chunk_id: chunkId });
  }

  txStatus(txHash: string, senderAccountId: string, waitUntil = "FINAL"): Promise<TxStatus> {
    return this.call("EXPERIMENTAL_tx_status", {
      tx_hash: txHash,
      sender_account_id: senderAccountId,
      wait_until: waitUntil,
    });
  }

  async receiptOutcome(receiptId: string, receiverId: string, lightClientHead: string): Promise<OutcomeWithId> {
    const res = await this.call<{ outcome_proof: OutcomeWithId }>("EXPERIMENTAL_light_client_proof", {
      type: "receipt",
      receipt_id: receiptId,
      receiver_id: receiverId,
      light_client_head: lightClientHead,
    });
    return res.outcome_proof;
  }

  viewAccount(accountId: string, ref: BlockRef = { finality: "final" }): Promise<AccountView> {
    return this.call("query", { request_type: "view_account", account_id: accountId, ...ref });
  }

  async view<T>(contractId: string, method: string, args: object = {}, ref: BlockRef = { finality: "final" }): Promise<T> {
    const res = await this.call<{ result?: number[]; error?: string }>("query", {
      request_type: "call_function",
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      ...ref,
    });

    if (typeof res.error === "string" || !Array.isArray(res.result)) {
      const msg = typeof res.error === "string" ? res.error : "the view returned no result";
      throw new RpcError(`CONTRACT_VIEW_ERROR: ${msg}`.slice(0, 500), /MethodNotFound/.test(msg) ? "METHOD_NOT_FOUND" : "CONTRACT_VIEW_ERROR", res);
    }
    const text = Buffer.from(res.result).toString("utf8");
    return (text ? JSON.parse(text) : null) as T;
  }
}

interface RawRpcError {
  name?: string;
  message?: string;
  data?: unknown;
  cause?: { name?: string; info?: unknown };
}

function toRpcError(e: RawRpcError): RpcError {
  const cause = e.cause?.name ?? null;
  const detail = typeof e.data === "string" ? e.data : JSON.stringify(e.data ?? e.cause?.info ?? "");
  return new RpcError(`${e.name ?? "RPC_ERROR"}${cause ? `/${cause}` : ""}: ${detail}`.slice(0, 500), cause, e.data);
}
