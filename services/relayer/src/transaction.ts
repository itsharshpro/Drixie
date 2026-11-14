import { createHash } from "node:crypto";
import { base64Decode, decodeSignedTransaction, type SignedTransaction } from "near-api-js";
import { MAX_SIGNED_DELEGATE_BYTES, viewActions, type FunctionCallView } from "./delegate";
import { badRequest } from "./errors";

export interface DecodedTransaction {
  signed: SignedTransaction;
  senderId: string;
  receiverId: string;
  nonce: bigint;
  publicKey: string;
  calls: Array<FunctionCallView | null>;
  actionKinds: string[];

  hash: string;
}

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function decodeTransaction(b64: unknown): DecodedTransaction {
  if (typeof b64 !== "string" || b64.length === 0) {
    throw badRequest("missing_transaction", "Send { signedTransaction } as a base64 string.");
  }
  if (b64.length > Math.ceil((MAX_SIGNED_DELEGATE_BYTES * 4) / 3) + 4 || !B64_RE.test(b64)) {
    throw badRequest("bad_transaction", "signedTransaction must be base64 and under 64 KB.");
  }
  let signed: SignedTransaction;
  try {
    signed = decodeSignedTransaction(base64Decode(b64));
  } catch {

    throw badRequest("bad_transaction", "The signed transaction couldn't be decoded. Update the app and try again.");
  }
  const tx = signed.transaction;
  if (tx.nonceIndex !== undefined || tx.nonceMode !== undefined) {
    throw badRequest("bad_transaction", "Gas-key transactions aren't supported by the relayer.");
  }
  const { calls, actionKinds } = viewActions(tx.actions);
  const hash = createHash("sha256").update(tx.encode()).digest();
  return {
    signed,
    senderId: tx.signerId,
    receiverId: tx.receiverId,
    nonce: BigInt(tx.nonce),
    publicKey: tx.publicKey.toString(),
    calls,
    actionKinds,
    hash: hash.toString("hex"),
  };
}

export function verifyTransactionSignature(t: DecodedTransaction): boolean {
  try {
    return t.signed.transaction.publicKey.verify(new Uint8Array(Buffer.from(t.hash, "hex")), t.signed.signature.data);
  } catch {
    return false;
  }
}

export function tokensBurnt(raw: { transaction_outcome?: { outcome: { tokens_burnt?: string } }; receipts_outcome?: Array<{ outcome: { tokens_burnt?: string } }> }): bigint {
  let total = BigInt(raw.transaction_outcome?.outcome.tokens_burnt ?? 0);
  for (const r of raw.receipts_outcome ?? []) total += BigInt(r.outcome.tokens_burnt ?? 0);
  return total;
}
