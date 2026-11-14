"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useConfig } from "@/lib/api/queries";
import { useSession } from "@/lib/auth/session";
import { balanceIncrease, formatNear } from "@/lib/chain/amount";
import { Badge } from "../ui/badge";
import { CopyButton } from "../ui/copy-button";
import { NumberRoll } from "../ui/number-roll";
import { Sheet } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { QrCode } from "./qr-code";
import { useLiveBalance } from "./use-live-balance";

const NETWORK_LABEL: Record<string, string> = { sandbox: "Local sandbox", testnet: "NEAR testnet", mainnet: "NEAR mainnet" };

export function walletLinks(network: string, accountId: string): { name: string; href: string }[] {
  const id = encodeURIComponent(accountId);
  if (network === "testnet") {
    return [
      { name: "MyNearWallet", href: `https://testnet.mynearwallet.com/send-money/${id}` },
      { name: "Meteor Wallet", href: "https://wallet.meteorwallet.app/" },
    ];
  }
  if (network === "mainnet") {
    return [
      { name: "MyNearWallet", href: `https://app.mynearwallet.com/send-money/${id}` },
      { name: "Meteor Wallet", href: "https://wallet.meteorwallet.app/" },
    ];
  }
  return [];
}

export function AddFundsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useSession();
  const accountId = session.status === "ready" ? session.accountId : null;
  const config = useConfig();
  const balance = useLiveBalance(accountId, open);
  const network = config.data?.network ?? "";

  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      last.current = null;
      return;
    }
    const now = balance.data ?? null;
    const up = balanceIncrease(last.current, now);
    if (up !== null) toast.success(`+${formatNear(up)} NEAR arrived`);
    if (now !== null) last.current = now;
  }, [open, balance.data]);

  const links = accountId ? walletLinks(network, accountId) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add funds" description="Your Drixie account is a normal NEAR account — anyone can send to it.">
      {!accountId ? (
        <p className="text-body-sm text-ink-2">Finish setting up your account first. It takes one passkey.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col items-center gap-4 rounded-card bg-fill px-4 py-5">
            <QrCode value={accountId} label={`QR code of ${accountId}`} className="p-1" />
            <div className="flex w-full items-center gap-1">
              <div className="min-w-0 flex-1">
                <div className="text-caption text-ink-3">Your Drixie account</div>
                <div className="num text-title-sm font-semibold text-ink [overflow-wrap:anywhere]" data-testid="wallet-account-id">
                  {accountId.split(".").map((part, i) => (
                    <span key={i}>
                      {i > 0 && "."}
                      {i > 0 && <wbr />}
                      {part}
                    </span>
                  ))}
                </div>
              </div>
              <span onClickCapture={() => toast.success("Account id copied")}>
                <CopyButton value={accountId} label="Copy account id" />
              </span>
            </div>
            {network && (
              <Badge tone="brand" dot className="self-start">
                {NETWORK_LABEL[network] ?? network}
              </Badge>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-label font-medium text-ink">Send NEAR from any wallet to this account</h3>
            {links.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {links.map((l) => (
                  <a
                    key={l.name}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 items-center justify-between gap-2 rounded-control bg-paper px-4 text-body-sm font-medium text-ink shadow-[0_0_0_1px_var(--line-strong)] transition-colors hover:bg-fill"
                  >
                    {l.name}
                    <ExternalLink className="size-4 text-ink-3" aria-hidden />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-ink-2">
                This is a private chain on this machine, so public wallets can&apos;t reach it. Send from another account on the same
                chain to the id above.
              </p>
            )}
            <p className="text-caption text-ink-3">Paste the account id as the receiver, pick an amount and send. It shows up here in a few seconds.</p>
          </section>

          <section className="flex items-end justify-between gap-4 border-t border-line pt-4">
            <div className="flex flex-col gap-1">
              <span className="text-caption text-ink-3">Balance</span>
              {balance.data !== undefined ? (
                <span className="flex items-baseline gap-1 text-title-sm font-semibold text-ink" data-testid="wallet-balance">
                  <NumberRoll value={formatNear(balance.data)} />
                  <span className="text-body-sm font-medium text-ink-2">NEAR</span>
                </span>
              ) : balance.isError ? (
                <span className="text-body-sm text-ink-2">Can&apos;t read the balance right now.</span>
              ) : (
                <Skeleton className="h-7 w-32" />
              )}
            </div>
            <span className="flex items-center gap-2 text-caption text-ink-3">
              <span className="size-1.5 rounded-full bg-brand" aria-hidden /> Checking every 4 s
            </span>
          </section>
        </div>
      )}
    </Sheet>
  );
}
