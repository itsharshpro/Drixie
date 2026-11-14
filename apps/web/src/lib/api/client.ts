import type { ApiError as ApiErrorBody } from "@listed/shared";
import { API_URL } from "../env";

export const UNREACHABLE_TITLE = "Can't reach Drixie right now";
export const UNREACHABLE_BODY = "Check your connection, then try again.";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
  get isNetwork(): boolean {
    return this.code === "network";
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

type Json = Record<string, unknown> | unknown[];

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Json;
  signal?: AbortSignal;
  query?: Record<string, string | number | null | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  return typeof v === "object" && v !== null && "error" in v && typeof (v as ApiErrorBody).error?.message === "string";
}

const STATUS_MESSAGE: Record<number, string> = {
  400: "Something in that request looks off. Check the fields and try again.",
  401: "Your session ended. Sign in again to continue.",
  403: "This account can't do that. Switch accounts or ask the owner.",
  404: "We couldn't find that. Check the link and try again.",
  409: "That changed while you were looking. Refresh and try again.",
  429: "That's a lot of requests at once. Wait a few seconds and try again.",
};

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      credentials: "include",
      headers: opts.body ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError("network", `${UNREACHABLE_TITLE}. ${UNREACHABLE_BODY}`, 0);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    if (isErrorBody(data)) throw new ApiError(data.error.code, data.error.message, res.status);
    const fallback =
      STATUS_MESSAGE[res.status] ??
      (res.status >= 500 ? "Drixie hit a problem on our side. Try again in a moment." : "That didn't work. Try again.");
    throw new ApiError(`http_${res.status}`, fallback, res.status);
  }
  return data as T;
}

export async function requestText(path: string, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path), { credentials: "include", signal, cache: "no-store" });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError("network", `${UNREACHABLE_TITLE}. ${UNREACHABLE_BODY}`, 0);
  }
  if (!res.ok) throw new ApiError(`http_${res.status}`, STATUS_MESSAGE[res.status] ?? "That didn't load. Try again.", res.status);
  return res.text();
}

export function streamUrl(topics: string[]): string {
  return buildUrl("/stream", { topics: topics.join(",") });
}
