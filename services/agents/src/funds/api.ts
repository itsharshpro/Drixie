import type { AssetCandles, AssetsResponse, FundDetail, FundsResponse, MovesPage, NewsPage, SeasonResponse } from "@listed/shared";

export interface ManagerNoteRecord {
  fund: string;
  bell: number;
  note: string;
  think: "normal" | "deep";
  tier: "best" | "primary" | "small";
  autopilot: boolean;
  adjusted: boolean;
  at: string;
}

export interface BrainBillRecord {
  id: string;
  fund: string;
  bell: number;
  at: string;
  tier: "best" | "primary" | "small";
  think: "normal" | "deep";
  aiCostUsd: number;
  multiplier: number;
  billUsd: number;
}

export type PostResult = "ok" | "unsupported" | "failed";

export interface FundsApi {
  funds(): Promise<FundsResponse | null>;
  fund(id: string): Promise<FundDetail | null>;
  assets(): Promise<AssetsResponse | null>;
  candles(asset: string, interval: "15m" | "1h", limit: number): Promise<AssetCandles | null>;
  moves(fund: string, limit: number): Promise<MovesPage | null>;
  news(limit: number): Promise<NewsPage | null>;
  season(): Promise<SeasonResponse | null>;
  postNote(rec: ManagerNoteRecord): Promise<PostResult>;
  postBills(records: BrainBillRecord[]): Promise<PostResult>;
}

export class HttpFundsApi implements FundsApi {
  private readonly base: string;
  private readonly missing = new Map<string, number>();

  constructor(
    apiUrl: string,
    private readonly serviceToken: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    this.base = `${apiUrl.replace(/\/+$/, "")}/v1`;
  }

  private async get<T>(path: string): Promise<T | null> {
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private async post(path: string, body: unknown): Promise<PostResult> {
    const until = this.missing.get(path) ?? 0;
    if (Date.now() < until) return "unsupported";
    if (!this.serviceToken) return "failed";
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-service-token": this.serviceToken },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 404) {
        this.missing.set(path, Date.now() + 2 * 60_000);
        return "unsupported";
      }
      return res.ok ? "ok" : "failed";
    } catch {
      return "failed";
    }
  }

  funds() {
    return this.get<FundsResponse>("/funds");
  }
  fund(id: string) {
    return this.get<FundDetail>(`/funds/${encodeURIComponent(id)}`);
  }
  assets() {
    return this.get<AssetsResponse>("/assets");
  }
  candles(asset: string, interval: "15m" | "1h", limit: number) {
    return this.get<AssetCandles>(`/assets/${encodeURIComponent(asset)}/candles?interval=${interval}&limit=${limit}`);
  }
  moves(fund: string, limit: number) {
    return this.get<MovesPage>(`/funds/${encodeURIComponent(fund)}/moves?limit=${limit}`);
  }
  news(limit: number) {
    return this.get<NewsPage>(`/world/news?limit=${limit}`);
  }
  season() {
    return this.get<SeasonResponse>("/season");
  }
  postNote(rec: ManagerNoteRecord) {
    return this.post("/internal/funds/notes", rec);
  }
  postBills(records: BrainBillRecord[]) {
    return this.post("/internal/funds/brain-bills", { records });
  }
}
