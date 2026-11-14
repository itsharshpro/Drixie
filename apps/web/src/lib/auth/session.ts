"use client";

import type { Me } from "@listed/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "../api/endpoints";
import { qk } from "../api/keys";
import { useMe, useQuery } from "../api/queries";
import { hasLocalKey } from "./passkey";

export type SessionStatus = "loading" | "error" | "signedOut" | "needsAccount" | "needsKey" | "ready";

export interface Session {
  status: SessionStatus;
  me: Me | null;
  accountId: string | null;
  error: Error | null;
  refetch: () => void;
}

export function useSession(): Session {
  const me = useMe();
  const accountId = me.data?.accountId ?? null;
  const key = useQuery({
    queryKey: ["listed", "local-key", accountId],
    queryFn: () => hasLocalKey(accountId as string),
    enabled: !!accountId,
    staleTime: Infinity,
  });

  let status: SessionStatus;
  if (me.isPending) status = "loading";
  else if (me.isError) status = "error";
  else if (!me.data) status = "signedOut";
  else if (!accountId) status = "needsAccount";
  else if (key.isPending) status = "loading";
  else status = key.data ? "ready" : "needsKey";

  return {
    status,
    me: me.data ?? null,
    accountId,
    error: (me.error as Error | null) ?? null,
    refetch: () => void me.refetch(),
  };
}

export function useSignOut(): () => Promise<void> {
  const qc = useQueryClient();
  return useCallback(async () => {
    try {
      await api.logout();
    } finally {
      qc.setQueryData(qk.me(), null);

      window.location.assign(`${window.location.origin}/signin`);
    }
  }, [qc]);
}

export function useRefreshLocalKey(): (accountId: string | null) => void {
  const qc = useQueryClient();
  return useCallback((accountId) => void qc.invalidateQueries({ queryKey: ["listed", "local-key", accountId] }), [qc]);
}
