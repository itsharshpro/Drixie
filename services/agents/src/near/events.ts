export interface NepEvent {
  standard: string;
  version: string;
  event: string;
  data: Record<string, unknown>;
  emitter: string; // executor account of the receipt that logged it
}

const PREFIX = "EVENT_JSON:";

export function parseEventLog(log: string, emitter: string): NepEvent[] {
  if (!log.startsWith(PREFIX)) return [];
  try {
    const raw = JSON.parse(log.slice(PREFIX.length)) as {
      standard?: string;
      version?: string;
      event?: string;
      data?: unknown;
    };
    if (!raw.standard || !raw.event) return [];
    const items = Array.isArray(raw.data) ? raw.data : [raw.data ?? {}];
    return items.map((d) => ({
      standard: raw.standard as string,
      version: raw.version ?? "",
      event: raw.event as string,
      data: (d && typeof d === "object" ? d : {}) as Record<string, unknown>,
      emitter,
    }));
  } catch {
    return [];
  }
}

interface OutcomeLike {
  receipts_outcome?: { outcome: { logs: string[]; executor_id: string } }[];
  transaction_outcome?: { outcome: { logs: string[]; executor_id: string } };
}

export function eventsFromOutcome(outcome: OutcomeLike): NepEvent[] {
  const out: NepEvent[] = [];
  const all = [outcome.transaction_outcome, ...(outcome.receipts_outcome ?? [])];
  for (const o of all) {
    if (!o) continue;
    for (const log of o.outcome.logs) out.push(...parseEventLog(log, o.outcome.executor_id));
  }
  return out;
}

export function successValue<T = unknown>(status: unknown): T | undefined {
  if (!status || typeof status !== "object" || !("SuccessValue" in status)) return undefined;
  const b64 = (status as { SuccessValue: string }).SuccessValue;
  if (!b64) return undefined;
  const text = Buffer.from(b64, "base64").toString("utf8");
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
