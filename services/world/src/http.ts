export const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) news-reader/1.0";

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    message: string,

    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchOptions {
  timeoutMs?: number;

  retries?: number;

  backoffMs?: number;

  maxBackoffMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;

  minSpacingMs?: number;

  retryOn429?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const lastRequestAt = new Map<string, number>();
const hostQueues = new Map<string, Promise<void>>();

async function spaceRequests(host: string, minSpacingMs: number, wait: (ms: number) => Promise<void>): Promise<void> {
  const prev = hostQueues.get(host) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  hostQueues.set(host, prev.then(() => mine));
  await prev;
  try {
    const since = Date.now() - (lastRequestAt.get(host) ?? 0);
    if (since < minSpacingMs) await wait(minSpacingMs - since);
    lastRequestAt.set(host, Date.now());
  } finally {
    release();
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export function backoffDelay(attempt: number, baseMs: number, maxMs: number, rand: () => number = Math.random): number {
  const raw = Math.min(maxMs, baseMs * 2 ** attempt);
  const jitter = raw * 0.25 * (rand() * 2 - 1);
  return Math.max(0, Math.round(raw + jitter));
}

const retryable = (status: number, on429: boolean) => (status === 429 ? on429 : status >= 500 || status === 408);

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<{ status: number; text: string; contentType: string }> {
  const {
    timeoutMs = 20_000,
    retries = 2,
    backoffMs = 2_000,
    maxBackoffMs = 60_000,
    headers = {},
    method = "GET",
    body,
    minSpacingMs = 0,
    retryOn429 = true,
    fetchImpl = fetch,
    sleep: wait = sleep,
  } = opts;
  const host = new URL(url).host;
  let lastErr: HttpError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (minSpacingMs > 0) await spaceRequests(host, minSpacingMs, wait);
    try {
      const res = await fetchImpl(url, {
        method,
        body,
        headers: { "user-agent": USER_AGENT, accept: "*/*", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      const text = await res.text();
      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok) return { status: res.status, text, contentType };
      const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
      lastErr = new HttpError(url, res.status, `HTTP ${res.status} from ${host}: ${text.slice(0, 160).replace(/\s+/g, " ")}`, retryAfterMs);
      if (!retryable(res.status, retryOn429) || attempt === retries) throw lastErr;
      await wait(Math.min(maxBackoffMs, retryAfterMs ?? backoffDelay(attempt, backoffMs, maxBackoffMs)));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const msg = err instanceof Error ? (err.name === "TimeoutError" ? `timed out after ${timeoutMs} ms` : err.message) : String(err);
      lastErr = new HttpError(url, 0, `Request to ${host} failed: ${msg}`);
      if (attempt === retries) throw lastErr;
      await wait(backoffDelay(attempt, backoffMs, maxBackoffMs));
    }
  }
  throw lastErr ?? new HttpError(url, 0, `Request to ${host} failed`);
}
