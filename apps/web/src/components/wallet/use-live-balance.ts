"use client";

import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api/keys";
import { configQuery, useQuery } from "@/lib/api/queries";
import { accountBalance } from "@/lib/chain/tx";

export const BALANCE_POLL_MS = 4_000;

export function useLiveBalance(accountId: string | null | undefined, live: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.balance(accountId ?? ""),
    queryFn: async () => accountBalance(await qc.ensureQueryData(configQuery()), accountId as string),
    enabled: !!accountId,
    staleTime: live ? 0 : 10_000,
    refetchInterval: live ? BALANCE_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}
