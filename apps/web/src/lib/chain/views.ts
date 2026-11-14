"use client";

import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../api/keys";
import { configQuery, useQuery } from "../api/queries";
import { accountBalance } from "./tx";

export function useBalance(accountId: string | null | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.balance(accountId ?? ""),
    queryFn: async () => accountBalance(await qc.ensureQueryData(configQuery()), accountId as string),
    enabled: !!accountId,
    staleTime: 10_000,
  });
}
