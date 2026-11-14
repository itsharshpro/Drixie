import { base64Decode } from "near-api-js";
import { extractEvents, extractLogs, type LocatedEvent, type ReceiptOutcomeLike } from "./events";

export interface TxResultLike {
  status?: unknown;
  transaction?: { hash?: string; signer_id?: string; receiver_id?: string };
  transaction_outcome?: ReceiptOutcomeLike & { outcome: { gas_burnt?: number | string } };
  receipts_outcome?: Array<ReceiptOutcomeLike & { outcome: { gas_burnt?: number | string; status?: unknown } }>;
}

export interface HumanError {
  code: string;
  message: string;
}

export interface OutcomeSummary {
  txHash: string;
  status: "success" | "failure" | "pending";
  returnValue: unknown;
  events: LocatedEvent[];
  logs: string[];

  gasBurnt: string;
  error?: HumanError;
}

export function txHashOf(result: TxResultLike): string {
  return result.transaction?.hash ?? result.transaction_outcome?.id ?? "";
}

export function decodeSuccessValue(value: string | undefined | null): unknown {
  if (!value) return null;
  const text = new TextDecoder().decode(base64Decode(value));
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function findFailure(result: TxResultLike): unknown | null {
  const status = result.status;
  if (status && typeof status === "object" && "Failure" in status) return (status as { Failure: unknown }).Failure;
  for (const r of result.receipts_outcome ?? []) {
    const s = r.outcome.status;
    if (s && typeof s === "object" && "Failure" in s) return (s as { Failure: unknown }).Failure;
  }
  return null;
}

export function isSuccess(result: TxResultLike): boolean {
  const s = result.status;
  return !!s && typeof s === "object" && "SuccessValue" in s;
}

export function returnValueOf<T = unknown>(result: TxResultLike): T | null {
  const s = result.status;
  if (s && typeof s === "object" && "SuccessValue" in s) {
    return decodeSuccessValue((s as { SuccessValue: string }).SuccessValue) as T | null;
  }
  return null;
}

export function summarizeOutcome(result: TxResultLike): OutcomeSummary {
  const failure = findFailure(result);
  const statusTop = result.status;
  const pending = statusTop === "NotStarted" || statusTop === "Started" || statusTop === undefined;
  let gas = BigInt(result.transaction_outcome?.outcome.gas_burnt ?? 0);
  for (const r of result.receipts_outcome ?? []) gas += BigInt(r.outcome.gas_burnt ?? 0);
  const summary: OutcomeSummary = {
    txHash: txHashOf(result),
    status: failure ? "failure" : pending ? "pending" : "success",
    returnValue: returnValueOf(result),
    events: extractEvents(result),
    logs: extractLogs(result),
    gasBurnt: gas.toString(),
  };
  if (failure) summary.error = describeFailure(failure);
  return summary;
}

const PANIC_PREFIXES = ["Smart contract panicked: ", "panicked at "];

function cleanPanic(msg: string): string {
  let m = msg;
  for (const p of PANIC_PREFIXES) if (m.startsWith(p)) m = m.slice(p.length);

  const quoted = /^'(.*)', [^ ]+:\d+:\d+$/.exec(m);
  if (quoted?.[1]) m = quoted[1];
  m = m.trim();
  if (!m) return "The contract rejected this action.";
  const first = m.charAt(0).toUpperCase() + m.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

function dig(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const found = dig(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function leafVariant(obj: unknown): string | null {
  let cur: unknown = obj;
  let name: string | null = null;
  for (let i = 0; i < 8; i++) {
    if (typeof cur === "string") return name ? `${name}.${cur}` : cur;
    if (!cur || typeof cur !== "object") break;
    const rec = cur as Record<string, unknown>;
    if (rec.kind !== undefined) {
      cur = rec.kind; // ActionError { index, kind }
      continue;
    }

    const keys = Object.keys(rec).filter((k) => /^[A-Z]/.test(k));
    if (keys.length !== 1) break;
    const k = keys[0] as string;
    if (k !== "ActionError" && k !== "InvalidTxError" && k !== "FunctionCallError") name = k;
    cur = rec[k];
  }
  return name;
}

export function describeFailure(error: unknown): HumanError {
  if (error instanceof Error) return describeThrown(error);
  const execution = dig(error, "ExecutionError");
  if (typeof execution === "string") return { code: "contract_panic", message: cleanPanic(execution) };
  const panic = dig(error, "panic_msg");
  if (typeof panic === "string") return { code: "contract_panic", message: cleanPanic(panic) };

  const variant = leafVariant(error) ?? "";
  const accountId = dig(error, "account_id");
  const acct = typeof accountId === "string" ? accountId : "The account";
  switch (true) {
    case variant.includes("MethodNotFound"):
      return { code: "method_not_found", message: "That action isn't available on this contract." };
    case variant.includes("CodeDoesNotExist"):
      return { code: "contract_missing", message: `${acct} has no contract deployed yet.` };
    case variant.includes("GasExceeded") || variant.includes("GasLimitExceeded"):
      return { code: "out_of_gas", message: "The action ran out of gas. Try again with more gas attached." };
    case variant.includes("AccountDoesNotExist"):
      return { code: "account_missing", message: `${acct} doesn't exist.` };
    case variant.includes("AccountAlreadyExists"):
      return { code: "account_exists", message: `${acct} already exists.` };
    case variant.includes("LackBalanceForState"):
      return { code: "storage_balance", message: `${acct} needs more NEAR to cover storage. Add funds and try again.` };
    case variant.includes("NotEnoughBalance") || variant.includes("BalanceExceeded"):
      return { code: "insufficient_balance", message: "Not enough NEAR in the account for this. Add funds or use a smaller amount." };
    case variant.includes("DelegateActionExpired"):
      return { code: "expired", message: "This request expired before it reached the chain. Please try again." };
    case variant.includes("DelegateActionInvalidNonce") || variant.includes("InvalidNonce"):
      return { code: "stale_nonce", message: "This action was already submitted or is out of date. Refresh and try again." };
    case variant.includes("DelegateActionNonceTooLarge") || variant.includes("NonceTooLarge"):
      return { code: "nonce_too_large", message: "The action's sequence number is too far ahead. Refresh and try again." };
    case variant.includes("DelegateActionInvalidSignature") || variant.includes("InvalidSignature"):
      return { code: "bad_signature", message: "The signature on this action is invalid. Sign in again on this device." };
    case variant.includes("DelegateActionAccessKeyError") || variant.includes("AccessKey"):
      return { code: "key_not_allowed", message: "This device's key can't authorize that action. Sign in again on this device." };
    case variant.includes("Expired"):
      return { code: "expired", message: "The transaction expired before it was processed. Please try again." };
    default:
      return {
        code: "tx_failed",
        message: variant ? `The transaction failed (${variant}). Please try again.` : "The transaction failed. Please try again.",
      };
  }
}

function describeThrown(err: Error): HumanError {
  const anyErr = err as Error & { panicMessage?: string; transactionResult?: TxResultLike };
  if (typeof anyErr.panicMessage === "string") return { code: "contract_panic", message: cleanPanic(anyErr.panicMessage) };
  if (anyErr.transactionResult) {
    const f = findFailure(anyErr.transactionResult);
    if (f) return describeFailure(f);
  }
  const name = err.constructor?.name ?? "";
  const msg = err.message || String(err);
  if (/fetch failed|ECONNREFUSED|network/i.test(msg)) {
    return { code: "rpc_unreachable", message: "The NEAR node is unreachable right now. Try again in a moment." };
  }
  if (/AccountDoesNotExist|does not exist/i.test(name + msg)) return { code: "account_missing", message: cleanPanic(msg) };
  if (/InvalidNonce/i.test(name)) return { code: "stale_nonce", message: "This action is out of date. Refresh and try again." };
  if (/Expired/i.test(name)) return { code: "expired", message: "The transaction expired before it was processed. Please try again." };
  if (/NotEnoughBalance/i.test(name)) return { code: "insufficient_balance", message: "Not enough NEAR to pay for this. Add funds and try again." };
  return { code: "error", message: cleanPanic(msg) };
}

export function delegatedReturnValue<T = unknown>(result: TxResultLike, receiverId: string): T | null {
  const receipts = result.receipts_outcome ?? [];
  const byId = new Map(receipts.map((r) => [r.id, r]));
  let cur = receipts.find((r) => r.outcome.executor_id === receiverId);
  for (let hops = 0; cur && hops < 16; hops++) {
    const s = cur.outcome.status as Record<string, unknown> | undefined;
    if (!s || typeof s !== "object") return null;
    if (typeof s.SuccessValue === "string") return decodeSuccessValue(s.SuccessValue) as T | null;
    if (typeof s.SuccessReceiptId === "string") {
      cur = byId.get(s.SuccessReceiptId);
      continue;
    }
    return null; // Failure
  }
  return null;
}
