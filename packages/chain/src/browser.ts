import type { PoolReserves } from "./funds/pool";
import {
  Account,
  actions as nearActions,
  base64Encode,
  baseDecode,
  buildDelegateAction,
  createTransaction,
  encodeSignedDelegate,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  type KeyPairString,
  type SerializedReturnValue,
} from "near-api-js";

export type FunctionCallSpec = { methodName: string; args: object; gas?: string; deposit?: string }; // gas/deposit as decimal strings

export interface RelayResult {
  txHash: string;
  status: string;
  outcome: unknown;
}

export class RelayError extends Error {
  readonly code: string;
  readonly status: number;
  readonly txHash?: string;
  readonly outcome?: unknown;
  constructor(message: string, code: string, status: number, txHash?: string, outcome?: unknown) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.status = status;
    this.txHash = txHash;
    this.outcome = outcome;
  }
}

const DEFAULT_GAS = BigInt("100000000000000");

export const SIGNED_TX_PREFIX = "tx:";
const ZERO = BigInt(0);
const ONE = BigInt(1);
const MAX_DELEGATE_DEPOSIT = ONE;

const DELEGATE_TTL_BLOCKS = BigInt(200);

const providers = new Map<string, JsonRpcProvider>();
function provider(rpcUrl: string): JsonRpcProvider {
  let p = providers.get(rpcUrl);
  if (!p) {
    p = new JsonRpcProvider({ url: rpcUrl }, { retries: 3, wait: 300, backoff: 1.5 });
    providers.set(rpcUrl, p);
  }
  return p;
}

const lastNonce = new Map<string, bigint>();

export function generateKeyPair(): { publicKey: string; secretKey: string } {
  const kp = KeyPair.fromRandom("ed25519");
  return { publicKey: kp.getPublicKey().toString(), secretKey: kp.toString() };
}

export async function signDelegateAction(opts: {
  accountId: string;
  secretKey: string;
  rpcUrl: string;
  receiverId: string;
  actions: FunctionCallSpec[];
}): Promise<string> {
  if (opts.actions.length === 0) throw new Error("signDelegateAction needs at least one action.");
  const specs = opts.actions;
  const keyPair = KeyPair.fromString(opts.secretKey as KeyPairString);
  const publicKey = keyPair.getPublicKey();
  const rpc = provider(opts.rpcUrl);

  const [accessKey, block] = await Promise.all([
    rpc.viewAccessKey({ accountId: opts.accountId, publicKey }).catch((err: unknown) => {
      throw new Error(
        `This device's key is not registered on ${opts.accountId}. Sign in again on this device. (${errorText(err)})`,
      );
    }),
    rpc.viewBlock({ finality: "final" }),
  ]);

  const cacheKey = `${opts.accountId}:${publicKey.toString()}`;
  const chainNext = BigInt(accessKey.nonce) + ONE;
  const localNext = (lastNonce.get(cacheKey) ?? ZERO) + ONE;
  const nonce = chainNext > localNext ? chainNext : localNext;
  lastNonce.set(cacheKey, nonce);

  const fnActions = specs.map((a) =>
    nearActions.functionCall(
      a.methodName,
      a.args,
      a.gas !== undefined ? BigInt(a.gas) : DEFAULT_GAS,
      a.deposit !== undefined ? BigInt(a.deposit) : ZERO,
    ),
  );
  const signer = new KeyPairSigner(keyPair);

  if (specs.some((a) => a.deposit !== undefined && BigInt(a.deposit) > MAX_DELEGATE_DEPOSIT)) {

    const tx = createTransaction(opts.accountId, publicKey, opts.receiverId, nonce, fnActions, baseDecode(block.header.hash));
    const { signedTransaction } = await signer.signTransaction(tx);
    return SIGNED_TX_PREFIX + base64Encode(new Uint8Array(signedTransaction.encode()));
  }

  const delegateAction = buildDelegateAction({
    senderId: opts.accountId,
    receiverId: opts.receiverId,
    actions: fnActions,
    nonce,
    maxBlockHeight: BigInt(block.header.height) + DELEGATE_TTL_BLOCKS,
    publicKey,
  });
  const { signedDelegate } = await signer.signDelegateAction(delegateAction);
  return base64Encode(new Uint8Array(encodeSignedDelegate(signedDelegate)));
}

export async function relay(
  relayerUrl: string,
  signedDelegate: string,
): Promise<{ txHash: string; status: string; outcome: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        signedDelegate.startsWith(SIGNED_TX_PREFIX)
          ? { signedTransaction: signedDelegate.slice(SIGNED_TX_PREFIX.length) }
          : { signedDelegate },
      ),
    });
  } catch {
    throw new RelayError("Couldn't reach the relayer. Check your connection and try again.", "relayer_unreachable", 0);
  }
  const body = (await res.json().catch(() => null)) as
    | (Partial<RelayResult> & { error?: { code?: string; message?: string } })
    | null;
  if (!res.ok || !body || body.error) {
    const message = body?.error?.message ?? `The relayer returned HTTP ${res.status}. Please try again.`;
    throw new RelayError(message, body?.error?.code ?? "relay_failed", res.status, body?.txHash, body?.outcome);
  }
  return { txHash: body.txHash ?? "", status: body.status ?? "unknown", outcome: body.outcome ?? null };
}

export async function view<T>(rpcUrl: string, contractId: string, method: string, args?: object): Promise<T> {
  const result = await provider(rpcUrl).callFunction<SerializedReturnValue>({
    contractId,
    method,
    args: (args ?? {}) as Record<string, unknown>,
    blockQuery: { finality: "optimistic" },
  });
  return result as T;
}

export async function getBalance(rpcUrl: string, accountId: string): Promise<string> {
  try {
    const available = await new Account(accountId, provider(rpcUrl)).getBalance();
    return available.toString();
  } catch (err) {
    if (/AccountDoesNotExist|does not exist|UNKNOWN_ACCOUNT/i.test(`${(err as Error)?.constructor?.name} ${errorText(err)}`)) {
      return "0";
    }
    throw err;
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export { parseEventLog, type NearEvent } from "./events";

export { fundsCalls } from "./funds/browser";
export * from "./funds/pool";
export * from "./funds/methods";
export * from "./funds/params";

export async function sendFundsCalls(opts: {
  accountId: string;
  secretKey: string;
  rpcUrl: string;
  relayerUrl: string;
  contractId: string;
  calls: FunctionCallSpec[];
}): Promise<RelayResult> {

  const signed = await signDelegateAction({
    accountId: opts.accountId,
    secretKey: opts.secretKey,
    rpcUrl: opts.rpcUrl,
    receiverId: opts.contractId,
    actions: opts.calls,
  });
  return relay(opts.relayerUrl, signed);
}

export const fundsViews = {
  pool: (rpcUrl: string, contractId: string, fund: string) => view<PoolReserves | null>(rpcUrl, contractId, "get_pool", { fund }),
  coinBalance: (rpcUrl: string, contractId: string, fund: string, accountId: string) =>
    view<string>(rpcUrl, contractId, "mt_balance_of", { account_id: accountId, token_id: fund }),

  orders: (rpcUrl: string, contractId: string, accountId: string) => view<unknown[]>(rpcUrl, contractId, "get_orders", { account: accountId }),
  config: (rpcUrl: string, contractId: string) => view<Record<string, unknown>>(rpcUrl, contractId, "get_config"),
};
