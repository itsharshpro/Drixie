import type { Me, PublicConfig } from "@listed/shared";
import { request } from "./client";

export const api = {
  health: (signal?: AbortSignal) => request<{ ok: boolean; chainHead: number; indexerLagBlocks: number }>("/health", { signal }),
  config: (signal?: AbortSignal) => request<PublicConfig>("/config", { signal }),

  me: (signal?: AbortSignal) => request<Me | { signedIn: false }>("/me", { signal }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST", body: {} }),
  passkeyRegisterOptions: (handle: string) => request<unknown>("/auth/passkey/register/options", { body: { handle } }),
  passkeyRegisterVerify: (handle: string, response: unknown) =>
    request<Me>("/auth/passkey/register/verify", { body: { handle, response: response as Record<string, unknown> } }),
  passkeyLoginOptions: () => request<unknown>("/auth/passkey/login/options", { body: {} }),
  passkeyLoginVerify: (response: unknown) => request<Me>("/auth/passkey/login/verify", { body: { response: response as Record<string, unknown> } }),
  emailStart: (email: string) => request<{ ok: boolean }>("/auth/email/start", { body: { email } }),
  emailVerify: (token: string) => request<Me>("/auth/email/verify", { body: { token } }),
  provision: (handle: string, publicKey: string) => request<{ accountId: string }>("/accounts", { body: { handle, publicKey } }),

  agentsStatus: (signal?: AbortSignal) => request<unknown>("/agents/status", { signal }),
};
