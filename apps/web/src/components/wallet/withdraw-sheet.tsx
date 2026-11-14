"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { configQuery, useQuery } from "@/lib/api/queries";
import { useSession } from "@/lib/auth/session";
import { checkWithdrawAmount, formatNear, maxWithdrawText, WITHDRAW_RESERVE_YOCTO, yoctoToNear } from "@/lib/chain/amount";
import { accountExists, isValidAccountId, sendNearTransfer, transferExplorerUrl } from "@/lib/chain/transfer";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { Sheet } from "../ui/sheet";
import { Spinner } from "../ui/spinner";
import { useLiveBalance } from "./use-live-balance";

type Step = "form" | "confirm";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function useReceiver(raw: string, self: string | null) {
  const qc = useQueryClient();
  const id = raw.trim().toLowerCase();
  const debounced = useDebounced(id, 400);
  const syntaxOk = isValidAccountId(debounced);
  const isSelf = !!self && debounced === self;
  const q = useQuery({
    queryKey: ["listed", "account-exists", debounced],
    queryFn: async () => accountExists((await qc.ensureQueryData(configQuery())).rpcUrl, debounced),
    enabled: syntaxOk && !isSelf,
    staleTime: 30_000,
    retry: 1,
  });
  const settled = debounced === id;
  let error: string | null = null;
  if (id && settled) {
    if (!syntaxOk) error = "That isn't a NEAR account id. It looks like name.testnet or name.near.";
    else if (isSelf) error = "That's your own account. Enter a different one.";
    else if (q.data === false) error = "Account not found";
    else if (q.isError) error = "Couldn't check that account right now. Try again.";
  }
  return { id, error, checking: !!id && (!settled || q.isFetching), ok: settled && syntaxOk && !isSelf && q.data === true };
}

export function WithdrawSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const session = useSession();
  const accountId = session.status === "ready" ? session.accountId : null;
  const balance = useLiveBalance(accountId, open);
  const [step, setStep] = useState<Step>("form");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("form");
      setTo("");
      setAmount("");
      setTouched(false);
      setSendError(null);
    }
  }

  const receiver = useReceiver(to, accountId);
  const bal = balance.data ?? null;
  const check = checkWithdrawAmount(amount, bal);
  const amountError = (touched || amount) && !check.ok ? check.error : null;
  const canReview = receiver.ok && check.ok && !!accountId;

  const review = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (canReview) {
      setSendError(null);
      setStep("confirm");
    }
  };

  const send = async () => {
    if (!accountId || !check.ok || !receiver.ok) return;
    setSending(true);
    setSendError(null);
    try {
      const cfg = await qc.ensureQueryData(configQuery());
      const { txHash } = await sendNearTransfer({ config: cfg, accountId, receiverId: receiver.id, yocto: check.yocto });
      const url = transferExplorerUrl(cfg, txHash);
      toast.success(`Sent ${yoctoToNear(check.yocto)} NEAR to ${receiver.id}`, {
        description: url ? undefined : `Transaction ${txHash.slice(0, 10)}…`,
        action: url ? { label: "View on explorer", onClick: () => window.open(url, "_blank", "noopener") } : undefined,
        duration: 10_000,
      });
      void qc.invalidateQueries({ queryKey: qk.balance(accountId) });
      onOpenChange(false);
    } catch (err) {
      setSendError((err as Error)?.message ?? "The transfer didn't go through. Nothing was sent.");
    } finally {
      setSending(false);
    }
  };

  const footer =
    step === "form" ? (
      <Button type="submit" form="withdraw-form" block size="lg" disabled={!accountId}>
        Review
      </Button>
    ) : (
      <div className="flex gap-2">
        <Button variant="secondary" size="lg" onClick={() => setStep("form")} disabled={sending} aria-label="Back to edit">
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button size="lg" className="flex-1" onClick={() => void send()} loading={sending} loadingLabel="Sending…">
          Send {check.ok ? yoctoToNear(check.yocto) : ""} NEAR
        </Button>
      </div>
    );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !sending && onOpenChange(o)}
      title={step === "form" ? "Withdraw" : "Confirm withdrawal"}
      description={step === "form" ? "Send NEAR from your Drixie account to any NEAR account." : "Check the details. This can't be undone."}
      footer={accountId ? footer : undefined}
    >
      {!accountId ? (
        <p className="text-body-sm text-ink-2">Finish setting up your account first. It takes one passkey.</p>
      ) : step === "form" ? (
        <form id="withdraw-form" onSubmit={review} className="flex flex-col gap-5" noValidate>
          <Field
            label="To account"
            error={receiver.error}
            success={receiver.ok}
            helper="The NEAR account that receives the money, like name.testnet."
            trailingLabel={receiver.checking ? <Spinner className="size-4 text-ink-3" /> : null}
          >
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              placeholder="name.testnet"
              className="num"
              data-testid="withdraw-to"
            />
          </Field>
          <Field
            label="Amount"
            error={amountError}
            helper={
              bal !== null ? (
                <>
                  You can send up to <span className="num">{maxWithdrawText(bal)}</span> NEAR. 0.05 NEAR stays for storage and fees.
                </>
              ) : (
                "Reading your balance…"
              )
            }
            trailingLabel={
              bal !== null ? (
                <Button type="button" size="sm" variant="ghost" pill onClick={() => setAmount(maxWithdrawText(bal))}>
                  Max
                </Button>
              ) : null
            }
          >
            <Input
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              onBlur={() => setTouched(true)}
              placeholder="0.0"
              trailing="NEAR"
              className="num"
              data-testid="withdraw-amount"
            />
          </Field>
          <div className="flex items-center justify-between rounded-control bg-fill px-4 py-3 text-body-sm">
            <span className="text-ink-2">Balance</span>
            <span className="num font-medium text-ink">{bal !== null ? `${formatNear(bal)} NEAR` : "…"}</span>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-line rounded-card bg-fill px-4 text-body-sm">
            <Row label="You send" value={`${check.ok ? formatNear(check.yocto, 24) : ""} NEAR`} strong />
            <Row label="From" value={accountId} mono />
            <Row label="To" value={receiver.id} mono />
            <Row label="Network fee" value="Under 0.001 NEAR, paid from your balance" />
            <Row
              label="Left after"
              value={bal !== null && check.ok ? `about ${formatNear(BigInt(bal) - check.yocto)} NEAR` : "…"}
            />
          </dl>
          <p className="flex items-start gap-2 text-caption text-ink-3">
            <Check className="mt-0.5 size-3.5 shrink-0 text-up" aria-hidden />
            Signed on this device with your key and sent straight to the NEAR network. {formatNear(WITHDRAW_RESERVE_YOCTO)} NEAR
            always stays for storage.
          </p>
          {sendError && (
            <p role="alert" className="rounded-control bg-down-soft px-4 py-3 text-body-sm text-down">
              {sendError}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-ink-2">{label}</dt>
      <dd className={[mono || strong ? "num break-all" : "break-words", "min-w-0 text-right", strong ? "font-semibold text-ink" : "text-ink"].join(" ")}>
        {value}
      </dd>
    </div>
  );
}
