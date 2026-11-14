"use client";

import type {
  AssetsResponse,
  FeedPage,
  FundCandleInterval,
  FundCandles,
  FundDetail,
  FundsResponse,
  MovesPage,
  NavRange,
  NavSeries,
  SeasonResponse,
} from "@listed/shared";
import { clockWords } from "@/lib/funds/format";
import { FUND_IDS } from "@listed/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { ApiError, getJson } from "../../lib/api";
import { navToSeries, newestMove, orderFunds, type BacktestInterval, type FundBacktest, type LineSeries } from "./logic";

export const FK = {
  all: ["landing", "funds"] as const,
  list: () => [...FK.all, "list"] as const,
  detail: (id: string) => [...FK.all, "detail", id] as const,
  nav: (id: string, range: NavRange) => [...FK.all, "nav", id, range] as const,
  candles: (id: string, interval: FundCandleInterval) => [...FK.all, "candles", id, interval] as const,
  moves: (id: string) => [...FK.all, "moves", id] as const,
  feed: () => [...FK.all, "feed"] as const,
  assets: () => [...FK.all, "assets"] as const,
  season: () => [...FK.all, "season"] as const,
  backtest: (id: string, interval: BacktestInterval) => [...FK.all, "backtest", id, interval] as const,
};

const retry = (count: number, err: unknown) => !(err instanceof ApiError && err.status !== null && err.status >= 400 && err.status < 500) && count < 1;
const base = { refetchIntervalInBackground: false, retry, gcTime: 5 * 60_000 } as const;

export type ArenaStatus = "loading" | "live" | "waiting" | "offline";

export function useFunds() {
  const q = useQuery({
    queryKey: FK.list(),
    queryFn: ({ signal }) => getJson<FundsResponse>("/funds", { signal, timeoutMs: 6000 }),
    refetchInterval: 15_000,
    staleTime: 10_000,
    ...base,
  });

  const hydrated = useHydrated();
  const data = hydrated ? q.data : undefined;
  const funds = useMemo(() => orderFunds(data?.items ?? []), [data]);

  const notYet = q.error instanceof ApiError && q.error.status === 404;
  const status: ArenaStatus = !hydrated ? "loading" : data ? (data.waiting || !funds.length ? "waiting" : "live") : notYet ? "waiting" : q.isError ? "offline" : "loading";
  return { data: data ?? null, funds, status, nextBellAt: data?.nextBellAt ?? funds.find((f) => f.nextBellAt)?.nextBellAt ?? null };
}

type NavResult = { data?: NavSeries; isLoading: boolean };

function combineSeries(results: NavResult[]): { series: LineSeries[]; spy: LineSeries | null; loading: boolean } {
  const series: LineSeries[] = [];
  let spy: LineSeries | null = null;
  for (const r of results) {
    if (!r.data) continue;
    const s = navToSeries(r.data.fund, r.data.points);
    if (s.fund.points.length) series.push(s.fund);
    if (!spy && s.spy.points.length) spy = s.spy;
  }
  return { series, spy, loading: results.some((r) => r.isLoading) };
}

export function useArenaSeries(ids: readonly string[], range: NavRange = "1D", enabled = true) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: FK.nav(id, range),
      queryFn: ({ signal }: { signal: AbortSignal }) => getJson<NavSeries>(`/funds/${encodeURIComponent(id)}/nav?range=${range}`, { signal }),
      refetchInterval: 60_000,
      staleTime: 30_000,
      enabled: enabled && !!id,
      ...base,
    })),
    combine: combineSeries,
  });
}

function combineNewest(results: { data?: MovesPage }[]) {
  return newestMove(results.map((r) => r.data?.items[0]));
}

export function useNewestMove(enabled = true, ids: readonly string[] = FUND_IDS) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: FK.moves(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getJson<MovesPage>(`/funds/${encodeURIComponent(id)}/moves?limit=1`, { signal }),
      refetchInterval: 60_000,
      staleTime: 30_000,
      enabled,
      ...base,
    })),
    combine: combineNewest,
  });
}

export function useFundCandles(id: string | null, interval: FundCandleInterval = "5m", enabled = true) {
  return useQuery({
    queryKey: FK.candles(id ?? "", interval),
    queryFn: ({ signal }) => getJson<FundCandles>(`/funds/${encodeURIComponent(id ?? "")}/candles?interval=${interval}&limit=96`, { signal }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: enabled && !!id,
    ...base,
  });
}

export function useFundDetails(ids: readonly string[] = FUND_IDS, enabled = true) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: FK.detail(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getJson<FundDetail>(`/funds/${encodeURIComponent(id)}`, { signal }),
      refetchInterval: 60_000,
      staleTime: 30_000,
      enabled,
      ...base,
    })),
  });
}

export function useFundsFeed(limit = 8, enabled = true) {
  return useQuery({
    queryKey: [...FK.feed(), limit],
    queryFn: ({ signal }) => getJson<FeedPage>(`/funds/feed?limit=${limit}`, { signal }),
    refetchInterval: 20_000,
    staleTime: 10_000,
    enabled,
    ...base,
  });
}

export function useAssets(enabled = true) {
  return useQuery({
    queryKey: FK.assets(),
    queryFn: ({ signal }) => getJson<AssetsResponse>("/assets", { signal }),
    refetchInterval: 60_000,
    staleTime: 45_000,
    enabled,
    ...base,
  });
}

export function useSeason(enabled = true) {
  return useQuery({
    queryKey: FK.season(),
    queryFn: ({ signal }) => getJson<SeasonResponse>("/season", { signal }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled,
    ...base,
  });
}

export function useClockWords() {
  const season = useSeason();
  return clockWords(season.data?.clock);
}

export const BACKTEST_FROM = "2026-11-01";

const backtestQuery = (id: string, interval: BacktestInterval, enabled: boolean) => ({
  queryKey: FK.backtest(id, interval),
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    getJson<FundBacktest>(`/funds/${encodeURIComponent(id)}/backtest?from=${BACKTEST_FROM}&interval=${interval}`, { signal }),
  refetchInterval: 5 * 60_000,
  staleTime: 4 * 60_000,
  enabled: enabled && !!id,
  ...base,
});

export function useFundBacktest(id: string | null, interval: BacktestInterval = "1h", enabled = true) {
  return useQuery(backtestQuery(id ?? "", interval, enabled));
}

function combineBacktests(results: { data?: FundBacktest }[]): (FundBacktest | null)[] {
  return results.map((r) => r.data ?? null);
}

export function useFundBacktests(ids: readonly string[], interval: BacktestInterval = "1h", enabled = true) {
  return useQueries({ queries: ids.map((id) => backtestQuery(id, interval, enabled)), combine: combineBacktests });
}
