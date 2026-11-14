"use client";

import type { FeedKind, FundCandleInterval, FundNftKind, NavRange } from "@listed/shared";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery } from "../api/queries";
import { fundsApi } from "./api";

const F = (id: string) => id.toLowerCase();

export const fk = {
  all: ["drixie-funds"] as const,
  funds: () => ["drixie-funds", "funds"] as const,
  fund: (id: string) => ["drixie-funds", "fund", F(id)] as const,
  nav: (id: string, range: NavRange) => ["drixie-funds", "fund", F(id), "nav", range] as const,
  candles: (id: string, interval: FundCandleInterval) => ["drixie-funds", "fund", F(id), "candles", interval] as const,
  moves: (id: string) => ["drixie-funds", "fund", F(id), "moves"] as const,
  reputation: (id: string) => ["drixie-funds", "fund", F(id), "reputation"] as const,
  assets: () => ["drixie-funds", "assets"] as const,
  asset: (id: string) => ["drixie-funds", "asset", id.toUpperCase()] as const,
  assetCandles: (id: string, interval: FundCandleInterval) => ["drixie-funds", "asset", id.toUpperCase(), "candles", interval] as const,
  portfolio: (account: string) => ["drixie-funds", "portfolio", account] as const,
  publicPortfolio: (account: string) => ["drixie-funds", "portfolio", account, "public"] as const,
  season: () => ["drixie-funds", "season"] as const,
  nfts: (q: { kind?: FundNftKind; owner?: string; fund?: string }) =>
    ["drixie-funds", "nfts", q.kind ?? "all", q.owner ?? "any", q.fund ?? "any"] as const,
  feed: (kinds: FeedKind[] | null, fund: string | null) =>
    ["drixie-funds", "feed", kinds?.slice().sort().join(",") ?? "all", fund ?? "all"] as const,
  feedAll: () => ["drixie-funds", "feed"] as const,
  vault: () => ["drixie-funds", "vault"] as const,
};

const SHORT_GC = 2 * 60_000;

export const fundsQuery = () =>
  queryOptions({ queryKey: fk.funds(), queryFn: ({ signal }) => fundsApi.funds(signal), staleTime: 10_000, refetchInterval: 60_000 });
export const fundQuery = (id: string) =>
  queryOptions({ queryKey: fk.fund(id), queryFn: ({ signal }) => fundsApi.fund(id, signal), staleTime: 10_000, refetchInterval: 90_000 });
export const navQuery = (id: string, range: NavRange) =>
  queryOptions({ queryKey: fk.nav(id, range), queryFn: ({ signal }) => fundsApi.nav(id, range, signal), staleTime: 30_000 });
export const fundCandlesQuery = (id: string, interval: FundCandleInterval) =>
  queryOptions({
    queryKey: fk.candles(id, interval),
    queryFn: ({ signal }) => fundsApi.candles(id, interval, signal),
    staleTime: 30_000,
    gcTime: SHORT_GC,
    refetchInterval: 60_000,
  });
export const assetCandlesQuery = (id: string, interval: FundCandleInterval) =>
  queryOptions({
    queryKey: fk.assetCandles(id, interval),
    queryFn: ({ signal }) => fundsApi.assetCandles(id, interval, signal),
    staleTime: 60_000,
    gcTime: SHORT_GC,
    refetchInterval: 5 * 60_000,
  });
export const movesQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: fk.moves(id),
    queryFn: ({ pageParam, signal }) => fundsApi.moves(id, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    maxPages: 5,
  });
export const reputationQuery = (id: string) =>
  queryOptions({ queryKey: fk.reputation(id), queryFn: ({ signal }) => fundsApi.reputation(id, signal), staleTime: 30_000 });
export const assetsQuery = () =>
  queryOptions({ queryKey: fk.assets(), queryFn: ({ signal }) => fundsApi.assets(signal), staleTime: 60_000, refetchInterval: 5 * 60_000 });
export const assetQuery = (id: string) =>
  queryOptions({ queryKey: fk.asset(id), queryFn: ({ signal }) => fundsApi.asset(id, signal), staleTime: 60_000 });
export const fundPortfolioQuery = (account: string) =>
  queryOptions({ queryKey: fk.portfolio(account), queryFn: ({ signal }) => fundsApi.portfolio(account, signal), staleTime: 10_000 });
export const publicPortfolioQuery = (account: string) =>
  queryOptions({ queryKey: fk.publicPortfolio(account), queryFn: ({ signal }) => fundsApi.publicPortfolio(account, signal), staleTime: 15_000 });
export const seasonQuery = () =>
  queryOptions({ queryKey: fk.season(), queryFn: ({ signal }) => fundsApi.season(signal), staleTime: 15_000, refetchInterval: 60_000 });
export const nftsQuery = (q: { kind?: FundNftKind; owner?: string; fund?: string }) =>
  infiniteQueryOptions({
    queryKey: fk.nfts(q),
    queryFn: ({ pageParam, signal }) => fundsApi.nfts({ ...q, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    maxPages: 4,
  });
export const feedQuery = (kinds: FeedKind[] | null, fund: string | null) =>
  infiniteQueryOptions({
    queryKey: fk.feed(kinds, fund),
    queryFn: ({ pageParam, signal }) => fundsApi.feed({ kind: kinds ?? undefined, fund: fund ?? undefined, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 20_000,
    maxPages: 5,
  });
export const vaultQuery = () =>
  queryOptions({ queryKey: fk.vault(), queryFn: ({ signal }) => fundsApi.vault(signal), staleTime: 30_000, refetchInterval: 120_000 });

export const useFunds = () => useQuery(fundsQuery());
export const useFund = (id: string) => useQuery(fundQuery(id));
export const useNav = (id: string, range: NavRange) => useQuery({ ...navQuery(id, range), placeholderData: keepPreviousData });
export const useFundCandles = (id: string, interval: FundCandleInterval, enabled = true) =>
  useQuery({ ...fundCandlesQuery(id, interval), enabled, placeholderData: keepPreviousData });
export const useAssetCandles = (id: string, interval: FundCandleInterval, enabled = true) =>
  useQuery({ ...assetCandlesQuery(id, interval), enabled, placeholderData: keepPreviousData });
export const useMoves = (id: string) => useInfiniteQuery(movesQuery(id));
export const useReputation = (id: string) => useQuery(reputationQuery(id));
export const useAssets = () => useQuery(assetsQuery());
export const useAsset = (id: string) => useQuery(assetQuery(id));
export const useFundPortfolio = (account: string | null | undefined) =>
  useQuery({ ...fundPortfolioQuery(account ?? ""), enabled: !!account });
export const usePublicPortfolio = (account: string) => useQuery(publicPortfolioQuery(account));
export const useSeason = () => useQuery(seasonQuery());
export const useNfts = (q: { kind?: FundNftKind; owner?: string; fund?: string }, enabled = true) =>
  useInfiniteQuery({ ...nftsQuery(q), enabled });
export const useFeed = (kinds: FeedKind[] | null, fund: string | null = null) => useInfiniteQuery(feedQuery(kinds, fund));
export const useVault = () => useQuery(vaultQuery());
