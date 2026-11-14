export const EVENT_PREFIX = "EVENT_JSON:";

export interface NearEvent<T = unknown> {
  standard: string;
  version: string;
  event: string;
  data: T;
}

export interface LocatedEvent<T = unknown> extends NearEvent<T> {
  receiptId: string;
  executorId: string;
  blockHash: string;

  logIndex: number;
}

export function parseEventLog(log: string): NearEvent | null {
  if (typeof log !== "string" || !log.startsWith(EVENT_PREFIX)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(log.slice(EVENT_PREFIX.length).trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.standard !== "string" || typeof o.version !== "string" || typeof o.event !== "string") {
    return null;
  }
  return { standard: o.standard, version: o.version, event: o.event, data: o.data ?? null };
}

export interface OutcomeLike {
  transaction_outcome?: ReceiptOutcomeLike;
  receipts_outcome?: ReceiptOutcomeLike[];
}
export interface ReceiptOutcomeLike {
  id: string;
  block_hash: string;
  outcome: { executor_id: string; logs: string[]; status?: unknown };
}

export function extractEvents(result: OutcomeLike, filter?: { standard?: string; event?: string }): LocatedEvent[] {
  const out: LocatedEvent[] = [];
  const receipts = result.receipts_outcome ?? [];
  for (const r of receipts) {
    r.outcome.logs.forEach((line, logIndex) => {
      const ev = parseEventLog(line);
      if (!ev) return;
      if (filter?.standard && ev.standard !== filter.standard) return;
      if (filter?.event && ev.event !== filter.event) return;
      out.push({ ...ev, receiptId: r.id, executorId: r.outcome.executor_id, blockHash: r.block_hash, logIndex });
    });
  }
  return out;
}

export function extractLogs(result: OutcomeLike): string[] {
  return (result.receipts_outcome ?? []).flatMap((r) => r.outcome.logs);
}
