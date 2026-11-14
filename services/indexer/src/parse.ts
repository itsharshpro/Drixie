export const EVENT_PREFIX = "EVENT_JSON:";

export interface NearEvent {
  standard: string;
  version: string;
  event: string;
  data: unknown;
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
  if (typeof o.standard !== "string" || typeof o.version !== "string" || typeof o.event !== "string") return null;
  return { standard: o.standard, version: o.version, event: o.event, data: o.data ?? null };
}

export function dataItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((d): d is Record<string, unknown> => !!d && typeof d === "object");
  if (data && typeof data === "object") return [data as Record<string, unknown>];
  return [];
}
