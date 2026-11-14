import { badRequest } from "../errors";

export function encodeCursor(v: unknown): string {
  return Buffer.from(JSON.stringify(v)).toString("base64url");
}

export function decodeCursor<T>(raw: string | undefined, guard: (v: unknown) => v is T): T | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (guard(v)) return v;
  } catch {

  }
  throw badRequest("That page cursor isn't valid. Start from the first page (omit cursor).", "invalid_cursor");
}

export type TimeCursor = [string, string];
export const isTimeCursor = (v: unknown): v is TimeCursor =>
  Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string" && !Number.isNaN(Date.parse(v[0]));

export type IdCursor = [number];
export const isIdCursor = (v: unknown): v is IdCursor => Array.isArray(v) && v.length === 1 && Number.isInteger(v[0]);

export function pageLimit(raw: unknown, def = 30, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}
