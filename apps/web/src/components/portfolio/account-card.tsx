"use client";

import { useSession } from "@/lib/auth/session";
import { formatNear } from "@/lib/chain/amount";
import { Button } from "../ui/button";
import { Card, CARD_PAD, CARD_TITLE } from "../ui/card";
import { CopyButton } from "../ui/copy-button";
import { NumberRoll } from "../ui/number-roll";
import { Skeleton } from "../ui/skeleton";
import { useLiveBalance } from "../wallet/use-live-balance";
import { useWalletSheets } from "../wallet/wallet-sheets";

export function AccountCard() {
  const session = useSession();
  const accountId = session.status === "ready" ? session.accountId : null;
  const balance = useLiveBalance(accountId, false);
  const sheets = useWalletSheets();
  if (!accountId) return null;

  return (
    <Card as="section" aria-labelledby="drixie-account-title" className={`${CARD_PAD} mb-4 lg:mb-6`} data-testid="account-card">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id="drixie-account-title" className={CARD_TITLE}>
            Your Drixie account
          </h2>
          {balance.data !== undefined ? (
            <div className="flex items-baseline gap-2">
              <span className="text-display-sm font-semibold tracking-[-0.02em] text-ink">
                <NumberRoll value={formatNear(balance.data, 2)} label={`${formatNear(balance.data, 2)} NEAR`} />
              </span>
              <span className="text-body font-medium text-ink-2">NEAR</span>
            </div>
          ) : balance.isError ? (
            <p className="text-body-sm text-ink-2">Can&apos;t read your balance right now.</p>
          ) : (
            <Skeleton className="h-9 w-40" />
          )}
          <div className="-my-2 flex min-w-0 items-center gap-1">
            <span className="num truncate text-body-sm text-ink-3" title={accountId}>
              {accountId}
            </span>
            <CopyButton value={accountId} label="Copy account id" />
          </div>
        </div>
        <div className="flex gap-2 md:shrink-0">
          <Button className="flex-1 md:flex-none" onClick={() => sheets.open("add")}>
            Add funds
          </Button>
          <Button variant="secondary" className="flex-1 md:flex-none" onClick={() => sheets.open("withdraw")}>
            Withdraw
          </Button>
        </div>
      </div>
      {sheets.node}
    </Card>
  );
}
