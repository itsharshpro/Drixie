"use client";

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, request } from "../api/client";
import { useQuery } from "../api/queries";

export interface FundPrediction {
  id: string;
  account: string;
  season: number;
  quarter: number;
  fund: string;
  createdAt: string;
  status: "open" | "locked" | "scored";

  winner: string | null;
  correct: boolean | null;
}

export interface FundPredictionsResponse {
  season: number;
  quarter: number;

  locksAt: string | null;
  open: boolean;

  crowd: Record<string, number>;
  mine: FundPrediction | null;

  history: FundPrediction[];

  board: { rank: number; account: string; handle: string | null; correct: number; calls: number; isHouse?: boolean }[];
}

export type FundPredictionsState = { available: false } | ({ available: true } & FundPredictionsResponse);

const key = (season: number | null, quarter: number | null) => ["drixie-funds", "predictions", season ?? "now", quarter ?? "now"] as const;

export const fundPredictionsQuery = (season: number | null, quarter: number | null) =>
  queryOptions({
    queryKey: key(season, quarter),
    queryFn: async ({ signal }): Promise<FundPredictionsState> => {
      try {
        const r = await request<FundPredictionsResponse>("/funds/predictions", { query: { season, quarter }, signal });
        return { available: true, ...r };
      } catch (err) {
        if (err instanceof ApiError && (err.code === "route_not_found" || err.status === 404)) return { available: false };
        throw err;
      }
    },
    staleTime: 15_000,

    refetchInterval: (q) => (q.state.data?.available === false ? false : 60_000),
    refetchOnWindowFocus: (q) => q.state.data?.available !== false,
    retry: false,
  });

export function useFundPredictions(season: number | null, quarter: number | null) {
  return useQuery(fundPredictionsQuery(season, quarter));
}

export function usePredictFund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { season: number; quarter: number; fund: string; fundName: string }) =>
      request<{ prediction: FundPrediction }>("/funds/predictions", { body: { season: v.season, quarter: v.quarter, fund: v.fund } }),
    onSuccess: (_r, v) => {
      toast.success(`Your call: ${v.fundName} wins this quarter`, { description: "Scored when the quarter closes." });
      void qc.invalidateQueries({ queryKey: ["drixie-funds", "predictions"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "That call didn't go through. Try again."),
  });
}
