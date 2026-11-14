interface ExecutionStatus {
  SuccessValue?: string;
  SuccessReceiptId?: string;
  Failure?: unknown;
}
interface ReceiptOutcome {
  id?: string;
  outcome?: { status?: ExecutionStatus | string; executor_id?: string; logs?: string[] };
}
interface FinalOutcome {
  status?: ExecutionStatus | string;
  transaction_outcome?: ReceiptOutcome;
  receipts_outcome?: ReceiptOutcome[];
}

function asOutcome(v: unknown): FinalOutcome | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if ("receipts_outcome" in o || "status" in o) return o as FinalOutcome;
  if ("final_execution_outcome" in o) return asOutcome(o.final_execution_outcome);
  if ("result" in o) return asOutcome(o.result);
  return null;
}

export function findFailure(outcome: unknown): string | null {
  const o = asOutcome(outcome);
  if (!o) return null;
  const check = (s: ExecutionStatus | string | undefined): string | null => {
    if (!s || typeof s === "string") return null;
    if (s.Failure !== undefined) return failureText(s.Failure);
    return null;
  };
  const top = check(o.status);
  if (top) return top;
  for (const r of o.receipts_outcome ?? []) {
    const f = check(r.outcome?.status);
    if (f) return f;
  }
  return null;
}

function failureText(f: unknown): string {

  const s = JSON.stringify(f);
  const m = s.match(/Smart contract panicked: ([^"\\]+)/) ?? s.match(/"ExecutionError":"([^"]+)"/);
  return m ? m[1] : s;
}

function decodeBase64(b64: string): string {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

export function findReturnValue<T = unknown>(outcome: unknown, receiverId?: string): T | null {

  if (outcome && typeof outcome === "object" && "returnValue" in outcome) {
    const rv = (outcome as { returnValue?: unknown }).returnValue;
    if (rv !== undefined && rv !== null) return rv as T;
  }
  const o = asOutcome(outcome);
  if (!o) return null;
  const candidates: string[] = [];
  for (const r of o.receipts_outcome ?? []) {
    const st = r.outcome?.status;
    if (!st || typeof st === "string" || !st.SuccessValue) continue;
    if (receiverId && r.outcome?.executor_id && r.outcome.executor_id !== receiverId) continue;
    candidates.push(st.SuccessValue);
  }
  if (o.status && typeof o.status !== "string" && o.status.SuccessValue) candidates.unshift(o.status.SuccessValue);
  for (const c of candidates) {
    try {
      const text = decodeBase64(c);
      if (!text) continue;
      return JSON.parse(text) as T;
    } catch {

    }
  }
  return null;
}

export function findEvents(outcome: unknown): Array<{ standard: string; event: string; data: unknown }> {
  const out: Array<{ standard: string; event: string; data: unknown }> = [];

  const pre = (outcome as { events?: unknown } | null)?.events;
  if (Array.isArray(pre)) {
    for (const e of pre as Array<{ standard?: string; event?: string; data?: unknown }>) {
      if (!e?.event) continue;
      const data = Array.isArray(e.data) && e.data.length === 1 ? e.data[0] : e.data;
      out.push({ standard: e.standard ?? "", event: e.event, data });
    }
    if (out.length) return out;
  }
  const o = asOutcome(outcome);
  if (!o) return out;
  for (const r of o.receipts_outcome ?? []) {
    for (const log of r.outcome?.logs ?? []) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const e = JSON.parse(log.slice("EVENT_JSON:".length)) as { standard: string; event: string; data: unknown };
        const data = Array.isArray(e.data) && e.data.length === 1 ? e.data[0] : e.data;
        out.push({ standard: e.standard, event: e.event, data });
      } catch {

      }
    }
  }
  return out;
}
