import { createHash, createPublicKey, verify } from "node:crypto";
import { base58Decode } from "./base58";

const NEP413_TAG = 2 ** 31 + 413;

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length);
  return Buffer.concat([len, utf8]);
}

export interface Nep413Message {
  message: string;

  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string | null;
}

export function nep413Digest(m: Nep413Message): Buffer {
  if (m.nonce.length !== 32) throw new Error("NEP-413 nonce must be 32 bytes");
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(NEP413_TAG);
  const callback = m.callbackUrl ? Buffer.concat([Buffer.from([1]), borshString(m.callbackUrl)]) : Buffer.from([0]);
  const body = Buffer.concat([tag, borshString(m.message), Buffer.from(m.nonce), borshString(m.recipient), callback]);
  return createHash("sha256").update(body).digest();
}

export function ed25519KeyBytes(publicKey: string): Buffer | null {
  if (!publicKey.startsWith("ed25519:")) return null;
  try {
    const raw = base58Decode(publicKey.slice("ed25519:".length));
    return raw.length === 32 ? Buffer.from(raw) : null;
  } catch {
    return null;
  }
}

export function decodeSignature(sig: string): Buffer | null {
  const s = sig.trim();
  try {
    if (s.startsWith("ed25519:")) {
      const raw = base58Decode(s.slice("ed25519:".length));
      return raw.length === 64 ? Buffer.from(raw) : null;
    }
    const b64 = Buffer.from(s, "base64");
    if (b64.length === 64) return b64;
    const b58 = base58Decode(s);
    return b58.length === 64 ? Buffer.from(b58) : null;
  } catch {
    return null;
  }
}

export function verifyNep413(publicKey: string, m: Nep413Message, signature: string): boolean {
  const key = ed25519KeyBytes(publicKey);
  const sig = decodeSignature(signature);
  if (!key || !sig) return false;
  try {
    const keyObject = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, key]), format: "der", type: "spki" });
    return verify(null, nep413Digest(m), keyObject, sig);
  } catch {
    return false;
  }
}

export function accountProofMessage(accountId: string, publicKey: string): string {
  return `Link ${accountId} to my Listed sign-in. Key: ${publicKey}`;
}
