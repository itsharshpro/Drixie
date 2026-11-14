import type { Me, PublicConfig } from "@listed/shared";

export function parseMe(body: unknown): Me | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Partial<Me> & { signedIn?: unknown };
  if (b.signedIn === false) return null;
  if (typeof b.userId !== "string" || !b.userId) return null;
  return {
    userId: b.userId,
    handle: typeof b.handle === "string" ? b.handle : null,
    accountId: typeof b.accountId === "string" ? b.accountId : null,
    email: typeof b.email === "string" ? b.email : null,
  };
}

export type ConfigWithCapabilities = PublicConfig & { agentKeys?: boolean };

export function agentKeysEnabled(config: PublicConfig | undefined | null): boolean {
  return (config as ConfigWithCapabilities | undefined | null)?.agentKeys === true;
}

export interface AgentsStatus {

  paused: boolean;

  waitingFor: string | null;
}

export function parseAgentsStatus(body: unknown): AgentsStatus | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { waiting?: unknown; configured?: unknown; paused?: unknown; llm?: { state?: unknown } | null };
  const waitingFor = typeof b.waiting === "string" && b.waiting ? b.waiting : null;
  const llmState = b.llm && typeof b.llm === "object" ? b.llm.state : undefined;
  if (waitingFor) return { paused: true, waitingFor };
  if (b.configured === false || b.paused === true || llmState === "waiting" || llmState === "invalid") {
    return { paused: true, waitingFor: llmState === "invalid" ? null : "NEARAI_API_KEY" };
  }
  if (b.waiting === null || b.configured === true || b.paused === false || llmState === "ready") return { paused: false, waitingFor: null };
  return null;
}
