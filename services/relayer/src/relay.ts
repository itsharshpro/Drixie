import {
  delegatedReturnValue,
  describeFailure,
  isAccountMissing,
  isKeyMissing,
  summarizeOutcome,
  yoctoToNearString,
  type ChainClient,
  type TxResultLike,
} from "@listed/chain";
import { actions } from "near-api-js";
import type { GasBudgets } from "./budget";
import type { RelayerConfig } from "./config";
import { decodeDelegate, verifyDelegateSignature, type DecodedDelegate } from "./delegate";
import { conflict, forbidden, RelayerError, unauthorized } from "./errors";
import { allowedMethods, checkPolicy, type ReceiverKind, type SignedRequest } from "./policy";
import type { RateLimiter } from "./ratelimit";
import type { ReceiverRegistry } from "./registry";
import type { Signers } from "./signers";
import { decodeTransaction, tokensBurnt, verifyTransactionSignature, type DecodedTransaction } from "./transaction";

export interface RelayDeps {
  config: Pick<RelayerConfig, "senderSuffixes" | "maxTtlBlocks" | "maxActions" | "refundGas" | "maxGasRefund">;
  client: ChainClient;
  registry: ReceiverRegistry;
  signers: Signers;
  senderLimiter: RateLimiter;

  gasBudgets?: GasBudgets;
  log?: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
}

export interface RelayResponse {
  status: number;
  body: Record<string, unknown>;
}

type Decoded = ({ kind: "delegate" } & DecodedDelegate) | ({ kind: "transaction" } & DecodedTransaction);

const inflight = new Map<string, Promise<RelayResponse>>();

export async function handleRelay(input: unknown, deps: RelayDeps): Promise<RelayResponse> {
  const body = (input ?? {}) as { signedDelegate?: unknown; signedTransaction?: unknown };
  const decoded: Decoded =
    body.signedTransaction !== undefined
      ? { kind: "transaction", ...decodeTransaction(body.signedTransaction) }
      : { kind: "delegate", ...decodeDelegate(body.signedDelegate) };
  const existing = inflight.get(decoded.hash);
  if (existing) return existing;
  const p = relayDecoded(decoded, deps).finally(() => inflight.delete(decoded.hash));
  inflight.set(decoded.hash, p);
  return p;
}

async function relayDecoded(d: Decoded, deps: RelayDeps): Promise<RelayResponse> {
  await deps.registry.ensureKnown(d.receiverId);
  const currentHeight = BigInt(await deps.client.blockHeight("final"));
  const kind = checkPolicy(
    d as SignedRequest,
    {
      kindOf: (id) => deps.registry.kindOf(id),
      isProtocolAccount: (id) =>
        deps.registry.isProtocolAccount(id) || id === deps.signers.relayerAccountId || id === deps.signers.playersAccountId,
      senderSuffixes: deps.config.senderSuffixes,
      currentHeight,
      maxTtlBlocks: deps.config.maxTtlBlocks,
      maxActions: deps.config.maxActions,
    },
    { allowDeposits: d.kind === "transaction" },
  );

  const sigOk = d.kind === "delegate" ? verifyDelegateSignature(d) : verifyTransactionSignature(d);
  if (!sigOk) throw unauthorized("bad_signature", "The signature on this action is invalid. Sign in again on this device.");
  await checkAccessKey(d, kind, deps.client);

  const wait = deps.senderLimiter.take(d.senderId);
  if (wait > 0) {
    throw new RelayerError(429, "rate_limited", `Too many actions from ${d.senderId}. Wait ${wait} s and try again.`, {
      retryAfter: wait,
    });
  }
  const over = deps.gasBudgets?.refusal(d.senderId);
  if (over) {
    const hours = Math.max(1, Math.ceil(over.retryAfterS / 3600));
    throw new RelayerError(
      429,
      over.code,
      over.code === "sender_gas_budget"
        ? `Your account used today's free gas. Try again in about ${hours} h.`
        : `The relayer has used today's gas budget. Try again in about ${hours} h.`,
      { retryAfter: over.retryAfterS },
    );
  }

  const raw = d.kind === "delegate" ? await submitDelegate(d, deps) : await submitTransaction(d, deps);

  if (d.kind === "delegate") deps.gasBudgets?.record(d.senderId, tokensBurnt(raw as Parameters<typeof tokensBurnt>[0]));
  const summary = summarizeOutcome(raw);
  const outcome: Record<string, unknown> = {
    returnValue: delegatedReturnValue(raw, d.receiverId),
    events: summary.events,
    logs: summary.logs,
    gasBurnt: summary.gasBurnt,
    sender: d.senderId,
    receiver: d.receiverId,
    methods: d.calls.map((c) => c?.methodName),
    mode: d.kind === "delegate" ? "meta-transaction" : "signed-transaction",

    ...rawOutcome(raw),
  };
  if (d.kind === "transaction") outcome.gasRefund = refundGas(d.senderId, raw, deps);

  if (summary.status === "failure") {
    return {
      status: 422,
      body: {
        error: summary.error ?? { code: "tx_failed", message: "The transaction failed." },
        txHash: summary.txHash,
        status: "failure",
        outcome,
      },
    };
  }
  return { status: 200, body: { txHash: summary.txHash, status: summary.status, outcome } };
}

async function submitDelegate(d: DecodedDelegate, deps: RelayDeps): Promise<TxResultLike> {
  const relayer = deps.signers.relayer();
  try {
    return (await relayer.signAndSendTransaction({
      receiverId: d.senderId,
      actions: [actions.signedDelegate({ delegateAction: d.signed.delegateAction, signature: d.signed.signature })],
      waitUntil: "EXECUTED_OPTIMISTIC",
      throwOnFailure: false,
    })) as unknown as TxResultLike;
  } catch (err) {
    throw submissionError(err, true);
  }
}

async function submitTransaction(d: DecodedTransaction, deps: RelayDeps): Promise<TxResultLike> {
  try {
    return (await deps.client.provider.sendTransactionUntil(d.signed, "EXECUTED_OPTIMISTIC")) as unknown as TxResultLike;
  } catch (err) {
    const anyErr = err as { transactionResult?: TxResultLike };
    if (anyErr.transactionResult) return anyErr.transactionResult; // executed but failed: report it as an outcome
    throw submissionError(err, false);
  }
}

function submissionError(err: unknown, relayerPays: boolean): RelayerError {
  const human = describeFailure(err);
  if (human.code === "insufficient_balance") {
    return relayerPays
      ? new RelayerError(503, "relayer_out_of_funds", "The relayer is out of gas money right now. Try again later.")
      : new RelayerError(402, "insufficient_balance", "Your account doesn't have enough NEAR for this amount plus fees. Add funds or use a smaller amount.");
  }
  return new RelayerError(502, human.code, human.message);
}

function refundGas(senderId: string, raw: TxResultLike, deps: RelayDeps): string | null {
  if (!deps.config.refundGas) return null;
  const burnt = tokensBurnt(raw as Parameters<typeof tokensBurnt>[0]);
  if (burnt <= 0n) return null;
  const amount = burnt > deps.config.maxGasRefund ? deps.config.maxGasRefund : burnt;
  deps.gasBudgets?.record(senderId, amount);
  const relayer = deps.signers.relayer();
  void deps.client
    .transfer(relayer, senderId, amount)
    .then((r) => deps.log?.info({ to: senderId, amount: amount.toString(), txHash: r.txHash }, "gas refunded"))
    .catch((err: unknown) => deps.log?.warn({ to: senderId, err: (err as Error).message }, `gas refund of ${yoctoToNearString(amount, 6)} NEAR failed`));
  return amount.toString();
}

function stripProof<T extends object | undefined>(o: T): T {
  if (!o || typeof o !== "object") return o;
  const { proof: _proof, ...rest } = o as Record<string, unknown>;
  return rest as T;
}

export function rawOutcome(raw: TxResultLike): Pick<TxResultLike, "status" | "transaction_outcome" | "receipts_outcome"> {
  return {
    status: raw.status,
    transaction_outcome: stripProof(raw.transaction_outcome),
    receipts_outcome: (raw.receipts_outcome ?? []).map((r) => stripProof(r)),
  };
}

async function checkAccessKey(d: Decoded, kind: ReceiverKind, client: ChainClient): Promise<void> {
  let ak;
  try {
    ak = await client.provider.viewAccessKey({ accountId: d.senderId, publicKey: d.publicKey });
  } catch (err) {
    if (isAccountMissing(err)) throw forbidden("sender_missing", `${d.senderId} doesn't exist yet. Finish signing up first.`);
    if (isKeyMissing(err)) {
      throw forbidden("key_not_found", `This device's key isn't registered on ${d.senderId}. Sign in again on this device.`);
    }
    throw err;
  }
  if (d.nonce <= BigInt(ak.nonce)) {
    throw conflict("stale_nonce", "This action was already submitted or is out of date. Refresh and try again.");
  }
  const perm = ak.permission;
  if (perm === "FullAccess") return;
  if (typeof perm === "object" && "FunctionCall" in perm) {
    const fc = perm.FunctionCall;
    const methods = new Set(fc.method_names);
    const ok =
      fc.receiver_id === d.receiverId &&
      d.calls.every((c) => c && c.deposit === 0n && (methods.size === 0 || methods.has(c.methodName)));
    if (ok) return;
    throw forbidden(
      "key_not_allowed",
      `This device's key can only call ${fc.receiver_id}${methods.size ? ` (${[...methods].join(", ")})` : ""} without deposits.`,
    );
  }

  if (!d.calls.every((c) => c && allowedMethods(kind).has(c.methodName))) {
    throw forbidden("key_not_allowed", "This device's key can't authorize that action.");
  }
}
