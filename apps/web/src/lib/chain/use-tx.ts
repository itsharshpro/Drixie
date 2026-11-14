"use client";

import type { PublicConfig } from "@listed/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { configQuery } from "../api/queries";
import { useSession } from "../auth/session";
import type { FunctionCallSpec } from "./actions";
import { sendActions, type TxResult } from "./tx";

export class NotSignedInError extends Error {
  constructor() {
    super("Sign in to do that. It takes one passkey and no seed phrase.");
    this.name = "NotSignedInError";
  }
}

export interface Tx {
  ready: boolean;
  accountId: string | null;
  getConfig: () => Promise<PublicConfig>;
  send: <R = unknown>(receiverId: string, actions: FunctionCallSpec[]) => Promise<TxResult<R>>;
}

export function useTx(): Tx {
  const qc = useQueryClient();
  const session = useSession();
  const accountId = session.accountId;

  const getConfig = useCallback(() => qc.ensureQueryData(configQuery()), [qc]);

  const send = useCallback(
    async <R = unknown>(receiverId: string, actions: FunctionCallSpec[]) => {
      if (!accountId) throw new NotSignedInError();
      const config = await getConfig();
      return sendActions<R>({ config, accountId, receiverId, actions });
    },
    [accountId, getConfig],
  );

  return { ready: session.status === "ready", accountId, getConfig, send };
}

export function companyAccount(ticker: string, root: string): string {
  return `${ticker.toLowerCase()}.${root}`;
}
