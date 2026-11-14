"use client";

import type { NavSeries } from "@listed/shared";
import { useQueries } from "@tanstack/react-query";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { navQuery } from "@/lib/funds/queries";

export function useSeasonNavs(funds: readonly string[]) {
  const hydrated = useHydrated();
  return useQueries({
    queries: funds.map((id) => ({ ...navQuery(id, "SEASON"), enabled: hydrated, refetchInterval: 60_000 })),
    combine: (rs) => ({
      series: rs.map((r, i) => ({ fund: funds[i]!, points: (r.data as NavSeries | undefined)?.points ?? [] })),
      loading: !hydrated || rs.some((r) => r.isPending),
      error: rs.every((r) => r.isError),
    }),
  });
}
