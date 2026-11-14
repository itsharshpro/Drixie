export class RpcError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "rpc" | "contract",
  ) {
    super(message);
  }
}

export interface AccountView {
  amount: string;
  locked: string;
  code_hash: string;
  storage_usage: number;

  global_contract_hash?: string;
  global_contract_account_id?: string;
}

export interface AccessKeyEntry {
  public_key: string;
  access_key: {
    nonce: number;
    permission:
      | "FullAccess"
      | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };
  };
}

export class NearRpc {
  private id = 0;

  constructor(
    readonly url: string,
    private readonly timeoutMs = 15_000,
  ) {}

  async call<T>(method: string, params: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new RpcError(`NEAR RPC unreachable at ${this.url}: ${(e as Error).message}`, "network");
    }
    if (!res.ok) throw new RpcError(`NEAR RPC HTTP ${res.status}`, "network");
    const body = (await res.json()) as { result?: T & { error?: string }; error?: { message?: string; data?: unknown; cause?: { name?: string } } };
    if (body.error) {
      const detail = typeof body.error.data === "string" ? body.error.data : JSON.stringify(body.error.data ?? body.error.cause ?? "");
      throw new RpcError(`${body.error.message ?? "RPC error"}: ${detail}`, "rpc");
    }
    if (body.result && typeof body.result === "object" && "error" in body.result && body.result.error) {
      throw new RpcError(String(body.result.error), "contract");
    }
    return body.result as T;
  }

  async view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
    const r = await this.call<{ result: number[] }>("query", {
      request_type: "call_function",
      finality: "optimistic",
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    });
    const text = Buffer.from(r.result).toString("utf8");
    return (text ? JSON.parse(text) : null) as T;
  }

  async chainTimeNs(): Promise<bigint> {
    const b = await this.call<{ header: { timestamp_nanosec?: string; timestamp: number } }>("block", {
      finality: "final",
    });
    return BigInt(b.header.timestamp_nanosec ?? b.header.timestamp);
  }

  async viewAccount(accountId: string): Promise<AccountView | null> {
    try {
      return await this.call<AccountView>("query", {
        request_type: "view_account",
        finality: "final",
        account_id: accountId,
      });
    } catch (e) {
      if (e instanceof RpcError && /does not exist|UNKNOWN_ACCOUNT/i.test(e.message)) return null;
      throw e;
    }
  }

  async viewAccessKeyList(accountId: string): Promise<AccessKeyEntry[]> {
    const r = await this.call<{ keys: AccessKeyEntry[] }>("query", {
      request_type: "view_access_key_list",
      finality: "final",
      account_id: accountId,
    });
    return r.keys;
  }

  async keyMethods(accountId: string, publicKey: string): Promise<string[] | null> {
    const r = await this.call<AccessKeyEntry["access_key"]>("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: accountId,
      public_key: publicKey,
    });
    if (r.permission === "FullAccess") return null;
    const m = r.permission.FunctionCall.method_names;
    return m.length ? m : null;
  }

  async keyAllowance(accountId: string, publicKey: string): Promise<bigint | null> {
    const r = await this.call<AccessKeyEntry["access_key"]>("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: accountId,
      public_key: publicKey,
    });
    if (r.permission === "FullAccess") return null;
    const a = r.permission.FunctionCall.allowance;
    return a === null ? null : BigInt(a);
  }
}
