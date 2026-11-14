"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AddFundsSheet } from "./add-funds-sheet";
import { WithdrawSheet } from "./withdraw-sheet";

export type WalletSheet = "add" | "withdraw";

export function useWalletSheets(): { open: (which: WalletSheet) => void; node: ReactNode } {
  const [which, setWhich] = useState<WalletSheet | null>(null);

  const open = useCallback((w: WalletSheet) => setTimeout(() => setWhich(w), 0) as unknown as void, []);
  const close = useCallback((o: boolean) => !o && setWhich(null), []);
  const node = useMemo(
    () => (
      <>
        <AddFundsSheet open={which === "add"} onOpenChange={close} />
        <WithdrawSheet open={which === "withdraw"} onOpenChange={close} />
      </>
    ),
    [which, close],
  );
  return { open, node };
}

export function AddFundsLink({ className }: { className?: string }) {
  const sheets = useWalletSheets();
  return (
    <p className={["text-body-sm text-ink-2", className].filter(Boolean).join(" ")}>
      Not enough NEAR?{" "}
      <button
        type="button"
        onClick={() => sheets.open("add")}
        className="relative font-medium text-brand underline-offset-4 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline"
      >
        Add funds
      </button>
      {sheets.node}
    </p>
  );
}
