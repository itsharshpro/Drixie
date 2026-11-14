const FALLBACK_API = "http://localhost:4000/v1";

export const API_BASE: string = (process.env.NEXT_PUBLIC_API_URL || FALLBACK_API).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface GetOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function getJson<T>(path: string, opts: GetOptions = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 6000);
  const forwardAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) throw new ApiError(`GET ${path} failed with ${res.status}`, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(`GET ${path} is unreachable`, null);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", forwardAbort);
  }
}

export function streamUrl(topics: string[]): string {
  return `${API_BASE}/stream?topics=${encodeURIComponent(topics.join(","))}`;
}
