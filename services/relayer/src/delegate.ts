import { createHash } from "node:crypto";
import { base64Decode, decodeSignedDelegate, encodeDelegateAction, type SignedDelegate } from "near-api-js";
import { badRequest } from "./errors";

export const MAX_SIGNED_DELEGATE_BYTES = 64 * 1024;

export interface FunctionCallView {
  methodName: string;
  gas: bigint;
  deposit: bigint;
  argsLength: number;
}

export interface DecodedDelegate {
  signed: SignedDelegate;
  senderId: string;
  receiverId: string;
  nonce: bigint;
  maxBlockHeight: bigint;
  publicKey: string;

  calls: Array<FunctionCallView | null>;
  actionKinds: string[];

  hash: string;
}

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function decodeDelegate(signedDelegateB64: unknown): DecodedDelegate {
  if (typeof signedDelegateB64 !== "string" || signedDelegateB64.length === 0) {
    throw badRequest("missing_delegate", "Send { signedDelegate } as a base64 string.");
  }
  if (signedDelegateB64.length > Math.ceil((MAX_SIGNED_DELEGATE_BYTES * 4) / 3) + 4 || !B64_RE.test(signedDelegateB64)) {
    throw badRequest("bad_delegate", "signedDelegate must be base64 and under 64 KB.");
  }
  let signed: SignedDelegate;
  try {
    signed = decodeSignedDelegate(base64Decode(signedDelegateB64));
  } catch {

    throw badRequest("bad_delegate", "The signed action couldn't be decoded. Update the app and try again.");
  }
  const da = signed.delegateAction;
  const { calls, actionKinds } = viewActions(da.actions);
  const hash = createHash("sha256").update(encodeDelegateAction(da)).digest();
  return {
    signed,
    senderId: da.senderId,
    receiverId: da.receiverId,
    nonce: BigInt(da.nonce),
    maxBlockHeight: BigInt(da.maxBlockHeight),
    publicKey: da.publicKey.toString(),
    calls,
    actionKinds,
    hash: hash.toString("hex"),
  };
}

export function viewActions(actions: readonly unknown[]): { calls: Array<FunctionCallView | null>; actionKinds: string[] } {
  const actionKinds: string[] = [];
  const calls = actions.map((a) => {
    const raw = a as Record<string, unknown> & { enum?: string };
    const kind = raw.enum ?? Object.keys(raw).find((k) => k !== "enum") ?? "unknown";
    actionKinds.push(kind);
    const fc = raw.functionCall as
      | { methodName?: string; method_name?: string; gas?: bigint | number | string; deposit?: bigint | number | string; args?: ArrayLike<number> }
      | undefined;
    if (kind !== "functionCall" || !fc) return null;
    return {
      methodName: String(fc.methodName ?? fc.method_name ?? ""),
      gas: BigInt(fc.gas ?? 0),
      deposit: BigInt(fc.deposit ?? 0),
      argsLength: fc.args?.length ?? 0,
    } satisfies FunctionCallView;
  });
  return { calls, actionKinds };
}

export function verifyDelegateSignature(d: DecodedDelegate): boolean {
  try {
    const digest = Buffer.from(d.hash, "hex");
    return d.signed.delegateAction.publicKey.verify(new Uint8Array(digest), d.signed.signature.data);
  } catch {
    return false;
  }
}
