import type {
  AssetCandles,
  AssetDetail,
  AssetsResponse,
  FeedKind,
  FeedPage,
  FundCandleInterval,
  FundCandles,
  FundDetail,
  FundNftKind,
  FundPortfolio,
  FundsResponse,
  MovesPage,
  NavRange,
  NavSeries,
  NftPage,
  ReputationHistory,
  RiskProfileRequest,
  RiskProfileResponse,
  SeasonResponse,
  VaultInfo,
} from "@listed/shared";
import { ApiError, request, streamUrl } from "../api/client";
import { API_URL } from "../env";

const id = (v: string) => encodeURIComponent(v);

async function orEmpty<T>(p: Promise<T>, empty: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.code === "route_not_found") return empty;
    throw err;
  }
}

const EMPTY_PAGE = { items: [], nextCursor: null };

const emptyPortfolio = (account: string | null): FundPortfolio => ({
  account: account ?? "",
  totalValueUsd: 0,
  totalCostUsd: 0,
  pnlUsd: 0,
  pnlPct: null,
  positions: [],
  pendingOrders: [],
  recentOrders: [],
  badges: [],
  promises: [],
});

export const fundsApi = {
  funds: (signal?: AbortSignal) =>
    orEmpty(request<FundsResponse>("/funds", { signal }), { items: [], spySeason: null, nextBellAt: null, lastBell: null, waiting: true, updatedAt: null }),
  fund: (fund: string, signal?: AbortSignal) => request<FundDetail>(`/funds/${id(fund)}`, { signal }),
  nav: (fund: string, range: NavRange, signal?: AbortSignal) => request<NavSeries>(`/funds/${id(fund)}/nav`, { query: { range }, signal }),
  candles: (fund: string, interval: FundCandleInterval, signal?: AbortSignal) =>
    request<FundCandles>(`/funds/${id(fund)}/candles`, { query: { interval, limit: 200 }, signal }),
  moves: (fund: string, cursor?: string | null, signal?: AbortSignal) =>
    orEmpty(request<MovesPage>(`/funds/${id(fund)}/moves`, { query: { cursor, limit: 20 }, signal }), EMPTY_PAGE),
  reputation: (fund: string, signal?: AbortSignal) => request<ReputationHistory>(`/funds/${id(fund)}/reputation`, { signal }),
  assets: (signal?: AbortSignal) =>
    orEmpty(request<AssetsResponse>("/assets", { signal }), { baskets: [], benchmark: { symbol: "SPY", price: null, change1d: null, updatedAt: null }, updatedAt: null }),
  asset: (asset: string, signal?: AbortSignal) => request<AssetDetail>(`/assets/${id(asset)}`, { signal }),
  assetCandles: (asset: string, interval: FundCandleInterval, signal?: AbortSignal) =>
    request<AssetCandles>(`/assets/${id(asset)}/candles`, { query: { interval, limit: 200 }, signal }),

  portfolio: async (account: string | null, signal?: AbortSignal): Promise<FundPortfolio> => {
    try {
      return await orEmpty(request<FundPortfolio>("/me/portfolio", { query: { account: account ?? undefined }, signal }), emptyPortfolio(account));
    } catch (err) {
      if (account && err instanceof ApiError && (err.status === 401 || err.status === 403)) return fundsApi.publicPortfolio(account, signal);
      throw err;
    }
  },

  publicPortfolio: (account: string, signal?: AbortSignal) =>
    orEmpty(request<FundPortfolio>(`/funds/portfolio/${id(account)}`, { signal }), emptyPortfolio(account)),
  riskProfile: (answers: RiskProfileRequest) => request<RiskProfileResponse>("/risk-profile", { body: { ...answers } }),
  season: (signal?: AbortSignal) =>
    orEmpty(request<SeasonResponse>("/season", { signal }), { clock: null, funds: [], users: [], quarters: [], trophies: [], dnaRevealed: false, settled: false }),
  nfts: (q: { kind?: FundNftKind; owner?: string; fund?: string; cursor?: string | null }, signal?: AbortSignal) =>
    orEmpty(request<NftPage>("/nfts", { query: { kind: q.kind, owner: q.owner, fund: q.fund, cursor: q.cursor, limit: 48 }, signal }), EMPTY_PAGE),
  feed: (q: { kind?: FeedKind[]; fund?: string; cursor?: string | null }, signal?: AbortSignal) =>
    orEmpty(request<FeedPage>("/funds/feed", { query: { kind: q.kind?.join(","), fund: q.fund, cursor: q.cursor, limit: 30 }, signal }), EMPTY_PAGE),
  vault: (signal?: AbortSignal) =>
    orEmpty(request<VaultInfo>("/vault", { signal }), { balance: "0", reserve: "0", liabilitiesUsd: 0, assetsUsd: 0, coveragePct: null, updatedAt: null }),
};

export function fundsStreamUrl(topics: string[]): string {
  return streamUrl(topics).replace(/\/stream\?/, "/funds/stream?");
}

export function nftImageUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = API_URL.replace(/\/v1$/, "");
  return path.startsWith("/v1/") ? `${base}${path}` : `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
