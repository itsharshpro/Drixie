import type { Me } from "@listed/shared";
import { generateKeyPair } from "@listed/chain/browser";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api } from "../api/endpoints";
import { keystore, pendingKeyId } from "../chain/keystore";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

function unwrapOptions<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "options" in raw) return (raw as { options: T }).options;
  if (raw && typeof raw === "object" && "optionsJSON" in raw) return (raw as { optionsJSON: T }).optionsJSON;
  return raw as T;
}

export function humanPasskeyError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  const msg = (err as Error)?.message ?? "";
  if (err instanceof AuthError) return err.message;
  if (name === "NotAllowedError" || /not allowed|timed out|cancel/i.test(msg))
    return "The passkey prompt was closed or timed out. Try again when you're ready.";
  if (name === "InvalidStateError" || /already registered/i.test(msg))
    return "This device already has a Drixie passkey. Use Continue with passkey instead.";
  if (name === "SecurityError") return "Passkeys need a secure address. Open Drixie on localhost or https and try again.";
  if (name === "NotSupportedError") return "This browser can't create passkeys. Use email instead.";
  if (name === "ApiError" || name === "AbortError") return msg || "That didn't work. Try again.";
  return msg && /[.!?]$/.test(msg) ? msg : "That didn't work. Try again, or use email instead.";
}

export async function signUpWithPasskey(handle: string): Promise<Me> {
  if (!passkeysSupported()) throw new AuthError("This browser doesn't support passkeys. Use email instead.");
  const optionsJSON = unwrapOptions<PublicKeyCredentialCreationOptionsJSON>(await api.passkeyRegisterOptions(handle));
  const attestation = await startRegistration({ optionsJSON });
  return api.passkeyRegisterVerify(handle, attestation);
}

export async function signInWithPasskey(): Promise<Me> {
  if (!passkeysSupported()) throw new AuthError("This browser doesn't support passkeys. Use email instead.");
  const optionsJSON = unwrapOptions<PublicKeyCredentialRequestOptionsJSON>(await api.passkeyLoginOptions());
  const assertion = await startAuthentication({ optionsJSON });
  return api.passkeyLoginVerify(assertion);
}

export async function provisionAccount(handle: string): Promise<string> {
  const h = handle.toLowerCase();
  let pending = await keystore.get("accounts", pendingKeyId(h));
  if (!pending) {
    const kp = generateKeyPair();
    await keystore.put("accounts", { id: pendingKeyId(h), publicKey: kp.publicKey, secretKey: kp.secretKey });
    pending = await keystore.get("accounts", pendingKeyId(h));
  }
  if (!pending) throw new AuthError("This browser blocked key storage. Turn off private browsing and try again.");
  const { accountId } = await api.provision(h, pending.publicKey);
  await keystore.put("accounts", { id: accountId, publicKey: pending.publicKey, secretKey: pending.secretKey });
  await keystore.remove("accounts", pendingKeyId(h));
  return accountId;
}

export async function hasLocalKey(accountId: string): Promise<boolean> {
  try {
    return (await keystore.get("accounts", accountId)) !== null;
  } catch {
    return false;
  }
}
