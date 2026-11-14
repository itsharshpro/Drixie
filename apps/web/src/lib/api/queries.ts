"use client";

import type { Me } from "@listed/shared";
import {
  queryOptions,
  useInfiniteQuery as useInfiniteQueryRaw,
  useQuery as useQueryRaw,
  type DefaultError,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useHydrated } from "../hooks/use-hydrated";
import { parseAgentsStatus, parseMe, type AgentsStatus } from "./capabilities";
import { ApiError } from "./client";
import { api } from "./endpoints";
import { qk } from "./keys";

export const configQuery = () =>
  queryOptions({ queryKey: qk.config(), queryFn: ({ signal }) => api.config(signal), staleTime: 5 * 60_000 });

export const meQuery = () =>
  queryOptions({
    queryKey: qk.me(),
    queryFn: async ({ signal }): Promise<Me | null> => {

      try {
        return parseMe(await api.me(signal));
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });

export const agentsStatusQuery = () =>
  queryOptions({
    queryKey: qk.agentsStatus(),
    queryFn: async ({ signal }): Promise<AgentsStatus | null> => {
      try {
        return parseAgentsStatus(await api.agentsStatus(signal));
      } catch (err) {
        if (err instanceof ApiError && !err.isNetwork) return null;
        throw err;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

const PENDING = { data: undefined, isPending: true, isLoading: true, isError: false, isSuccess: false, status: "pending", error: null } as const;

export function useQuery<TQueryFnData, TError = DefaultError, TData = TQueryFnData, TKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TKey>,
): UseQueryResult<TData, TError> {
  const hydrated = useHydrated();
  const r = useQueryRaw(options);
  return hydrated ? r : ({ ...r, ...PENDING } as unknown as UseQueryResult<TData, TError>);
}

export function useInfiniteQuery<TQueryFnData, TError = DefaultError, TData = InfiniteData<TQueryFnData>, TKey extends QueryKey = QueryKey, TPageParam = unknown>(
  options: UseInfiniteQueryOptions<TQueryFnData, TError, TData, TKey, TPageParam>,
): UseInfiniteQueryResult<TData, TError> {
  const hydrated = useHydrated();
  const r = useInfiniteQueryRaw(options);
  return hydrated ? r : ({ ...r, ...PENDING } as unknown as UseInfiniteQueryResult<TData, TError>);
}

export const useConfig = () => useQuery(configQuery());
export const useMe = () => useQuery(meQuery());
