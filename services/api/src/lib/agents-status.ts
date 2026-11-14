import type { AgentsStatus } from "@listed/shared";

export type { AgentsStatus };
export type AgentsState = AgentsStatus["state"];

interface AgentsHealth {
  ok?: boolean;
  waiting?: string | null;
  llm?: { state?: string; reason?: string } | null;

  budget?: { exceeded?: boolean } | null;
  paused?: boolean | string | null;
}

export const GENERIC_AI_KEY = "AI_API_KEY";

export function toAgentsStatus(health: AgentsHealth | null, now = new Date()): AgentsStatus {
  const checkedAt = now.toISOString();
  if (!health) {
    return { state: "unreachable", paused: true, waiting: null, message: "The AI agents are offline right now. Orders wait until they're back.", checkedAt };
  }
  const waiting = typeof health.waiting === "string" && health.waiting ? health.waiting : null;
  if (waiting || health.llm?.state === "waiting") {
    return {
      state: "waiting_for_key",
      paused: true,
      waiting: GENERIC_AI_KEY,
      message: "Agents are paused: no AI key is configured yet. Orders wait until it is.",
      checkedAt,
    };
  }
  if (health.budget?.exceeded || health.llm?.state === "paused" || health.paused === true || health.paused === "budget") {
    return { state: "running", paused: true, waiting: null, message: "Agents are paused for today. Orders wait until they resume.", checkedAt };
  }
  return { state: "running", paused: false, waiting: null, message: null, checkedAt };
}

export class AgentsStatusCache {
  private cached: { at: number; value: AgentsStatus } | null = null;
  private inflight: Promise<AgentsStatus> | null = null;

  constructor(
    private readonly url: string,
    private readonly fetchFn: typeof fetch,
    private readonly ttlMs = 10_000,
  ) {}

  async get(): Promise<AgentsStatus> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.value;
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<AgentsStatus> {
    let health: AgentsHealth | null = null;
    try {
      const res = await this.fetchFn(`${this.url}/health`, { signal: AbortSignal.timeout(2_000), headers: { accept: "application/json" } });
      if (res.ok) health = (await res.json()) as AgentsHealth;
    } catch {
      health = null;
    }
    const value = toAgentsStatus(health);
    this.cached = { at: Date.now(), value };
    return value;
  }
}
