"use client";

import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { configQuery } from "../api/queries";
import { humanChainError } from "../chain/errors";
import { explorerUrl, MissingKeyError, TxError, type TxResult } from "../chain/tx";
import { NotSignedInError } from "../chain/use-tx";

type Rollback = () => void;

export function snapshot(qc: QueryClient, keys: QueryKey[]): Rollback {
  const saved = keys.flatMap((k) => qc.getQueriesData({ queryKey: k }));
  return () => {
    for (const [key, data] of saved) qc.setQueryData(key, data);
  };
}

export interface TxMutationOptions<V, R> {
  run: (vars: V) => Promise<TxResult<R>>;

  optimistic?: { keys: (vars: V) => QueryKey[]; apply: (qc: QueryClient, vars: V) => void };
  invalidate?: (vars: V, result: TxResult<R>) => QueryKey[];
  success?: (vars: V, result: TxResult<R>) => { title: string; description?: string } | null;
  pending?: (vars: V) => string | null;
  onSuccess?: (result: TxResult<R>, vars: V) => void;
}

export function errorMessage(err: unknown): string {
  if (err instanceof TxError || err instanceof MissingKeyError || err instanceof NotSignedInError) return err.message;
  return humanChainError(err);
}

export function useTxMutation<V, R = unknown>(opts: TxMutationOptions<V, R>) {
  const qc = useQueryClient();
  return useMutation<TxResult<R>, Error, V, { rollback?: Rollback; toastId?: string | number }>({
    mutationFn: opts.run,
    onMutate: async (vars) => {
      let rollback: Rollback | undefined;
      if (opts.optimistic) {
        const keys = opts.optimistic.keys(vars);
        await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: k })));
        rollback = snapshot(qc, keys);
        opts.optimistic.apply(qc, vars);
      }
      const pendingTitle = opts.pending?.(vars);
      const toastId = pendingTitle ? toast.loading(pendingTitle) : undefined;
      return { rollback, toastId };
    },
    onError: (err, _vars, ctx) => {
      ctx?.rollback?.();
      toast.error(errorMessage(err), { id: ctx?.toastId });
    },
    onSuccess: (result, vars, ctx) => {
      const msg = opts.success?.(vars, result);
      const config = qc.getQueryData(configQuery().queryKey);
      const href = explorerUrl(config, result.txHash);
      if (msg) {
        toast.success(msg.title, {
          id: ctx?.toastId,
          description: msg.description,
          action: href ? { label: "Verify", onClick: () => window.open(href, "_blank", "noopener,noreferrer") } : undefined,
        });
      } else if (ctx?.toastId !== undefined) {
        toast.dismiss(ctx.toastId);
      }
      opts.onSuccess?.(result, vars);
    },
    onSettled: (result, _err, vars) => {
      const keys = result && opts.invalidate ? opts.invalidate(vars, result) : opts.optimistic?.keys(vars) ?? [];
      for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    },
  });
}
