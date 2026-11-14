"use client";

import { AlertTriangle, Eye, EyeOff, KeyRound, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { yoctoToNear } from "@listed/shared";
import { useConfig, useQuery } from "@/lib/api/queries";
import { useRefreshLocalKey, useSession, useSignOut } from "@/lib/auth/session";
import { keystore } from "@/lib/chain/keystore";
import { useBalance } from "@/lib/chain/views";
import { formatNear } from "@/lib/format";
import { useField } from "@/lib/hooks/use-field";
import { DUR, EASE } from "@/lib/motion";
import { AccountPrompt } from "../ui/account-cta";
import { Avatar } from "../shell/avatar";
import { PageHeader } from "../ui/page-header";
import { Button } from "../ui/button";
import { Card, CARD_TITLE } from "../ui/card";
import { CopyButton } from "../ui/copy-button";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { NumberRoll } from "../ui/number-roll";
import { PriceFlash } from "../ui/price-flash";
import { Skeleton } from "../ui/skeleton";
import { Reveal } from "../ui/transitions";

const NETWORK_LABEL: Record<string, string> = { sandbox: "Local (NEAR sandbox)", testnet: "NEAR testnet", mainnet: "NEAR mainnet" };

export function SettingsScreen() {
  const session = useSession();
  const signedIn = session.status === "ready" || session.status === "needsKey";
  return (
    <div>
      <PageHeader back={false} title="Settings" subtitle="Your account, the key on this device, and signing out." />
      <Reveal ready={session.status !== "loading"} fallback={<SettingsSkeleton />}>
        {() => {
          if (signedIn) {
            return (
              <SignedIn
                accountId={session.accountId as string}
                handle={session.me?.handle ?? session.me?.email ?? "You"}
                email={session.me?.email ?? null}
                hasKey={session.status === "ready"}
              />
            );
          }
          if (session.status === "needsAccount") {

            return (
              <div className="flex flex-col divide-y divide-line">
                <Section title="Account" body="Pick a name and we'll create your NEAR account. No seed phrase.">
                  <Card>
                    <AccountPrompt verb="manage your account" compact />
                  </Card>
                </Section>
                <Section title="Sign out" body="You can sign back in with the same passkey or email.">
                  <SignOutCard who={session.me?.email ?? session.me?.handle ?? null} />
                </Section>
              </div>
            );
          }
          return (
            <Card>
              <AccountPrompt verb="manage your account" />
            </Card>
          );
        }}
      </Reveal>
    </div>
  );
}

function SignedIn({ accountId, handle, email, hasKey }: { accountId: string; handle: string; email: string | null; hasKey: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-line">
      <Section title="Account" body="Your name on Drixie and the NEAR account behind it.">
        <AccountCard handle={handle} email={email} accountId={accountId} />
      </Section>
      <Section title="Account key" body="The key that signs your trades. It is made on your device and never sent to Drixie.">
        <KeyCard accountId={accountId} hasKey={hasKey} />
      </Section>
            <Section title="Sign out" body="Your key stays on this device, so your passkey signs you back in.">
        <SignOutCard who={handle} />
      </Section>
    </div>
  );
}

function Section({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid grid-cols-1 gap-4 py-6 first:pt-0 lg:grid-cols-12 lg:gap-6 lg:py-8">
      <div className="lg:col-span-4 lg:pt-6">
        <h2 className={CARD_TITLE}>{title}</h2>
        <p className="mt-1 max-w-80 text-caption text-ink-2">{body}</p>
      </div>
      <div className="min-w-0 lg:col-span-8">{children}</div>
    </section>
  );
}

function AccountCard({ handle, email, accountId }: { handle: string; email: string | null; accountId: string }) {
  const config = useConfig();
  const balance = useBalance(accountId);
  return (
    <Card padded>
      <div className="flex items-center gap-4">
        <Avatar name={handle} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-title-sm font-semibold">{handle}</p>
          <p className="truncate text-caption text-ink-2">{email ?? "Signed in with a passkey"}</p>
        </div>
      </div>
      <dl className="mt-5 flex flex-col divide-y divide-line border-t border-line">
        <Row label="Account">
          <span className="flex min-w-0 items-center justify-end gap-1">
            <code className="num min-w-0 truncate text-body-sm">{accountId}</code>
            <CopyButton value={accountId} label="Copy account id" className="-my-2 -mr-3" />
          </span>
        </Row>
        <Row label="Balance">
          {balance.isPending ? (
            <Skeleton className="ml-auto h-4 w-24" />
          ) : balance.data ? (
            <PriceFlash value={yoctoToNear(balance.data)}>
              <span className="inline-flex items-baseline gap-1">
                <NumberRoll value={formatNear(balance.data)} className="text-body-sm font-medium" />
                <span className="text-caption text-ink-3">NEAR</span>
              </span>
            </PriceFlash>
          ) : (
            <span className="text-ink-3">Not available</span>
          )}
        </Row>
        <Row label="Network">{config.data ? (NETWORK_LABEL[config.data.network] ?? config.data.network) : <Skeleton className="ml-auto h-4 w-28" />}</Row>
        <Row label="Network fees">
          <span className="font-medium text-up">Paid by Drixie</span>
        </Row>
      </dl>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <dt className="shrink-0 text-body-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 text-right text-body-sm">{children}</dd>
    </div>
  );
}

function KeyCard({ accountId, hasKey }: { accountId: string; hasKey: boolean }) {
  const [reveal, setReveal] = useState(false);
  const [confirmShow, setConfirmShow] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const refresh = useRefreshLocalKey();
  const reduce = useReducedMotion();
  const key = useQuery({ queryKey: ["listed", "local-key-value", accountId], queryFn: () => keystore.get("accounts", accountId), enabled: hasKey && reveal });

  const remove = async () => {
    setRemoving(true);
    try {
      await keystore.remove("accounts", accountId);
      setReveal(false);
      setConfirmRemove(false);
      refresh(accountId);
      toast.success("Key removed from this device", { description: "Import it again from Settings to trade here." });
    } catch {
      toast.error("Couldn't remove the key. Reload the page and try again.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card padded className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-fill" aria-hidden>
          <KeyRound className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-body-sm font-medium">{hasKey ? "On this device" : "Not on this device"}</p>
          <p className="text-caption text-ink-2">
            {hasKey
              ? "Export it to use your account on another device."
              : "Import your key to buy, sell and order from this device."}
          </p>
        </div>
      </div>
      {hasKey ? (
        <>
          <AnimatePresence initial={false}>
            {reveal && (
              <motion.div
                key="secret"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: reduce ? 0 : DUR.standard, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2 rounded-control bg-down-soft p-3 text-caption text-down" role="note">
                    <AlertTriangle className="mt-px size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    Anyone with this key controls your account. Never paste it into a website or share it.
                  </div>
                  <div className="flex items-center gap-2 rounded-control bg-fill py-1 pl-3 pr-1">
                    {key.data ? (
                      <code className="num min-w-0 flex-1 break-all text-caption">{key.data.secretKey}</code>
                    ) : (
                      <Skeleton className="h-4 flex-1" />
                    )}
                    {key.data && <CopyButton value={key.data.secretKey} label="Copy secret key" />}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => (reveal ? setReveal(false) : setConfirmShow(true))} aria-expanded={reveal}>
              {reveal ? <EyeOff className="size-4" strokeWidth={1.75} aria-hidden /> : <Eye className="size-4" strokeWidth={1.75} aria-hidden />}
              {reveal ? "Hide key" : "Export key"}
            </Button>
            <Button variant="ghost" className="text-down hover:bg-down-soft" onClick={() => setConfirmRemove(true)}>
              Remove from this device
            </Button>
          </div>
          <Dialog open={confirmShow} onOpenChange={setConfirmShow} title="Show your secret key?" description="Make sure nobody can see your screen.">
            <div className="flex flex-col gap-4">
              <p className="text-body-sm text-ink-2">Drixie never asks for this key. Keep it somewhere safe, like a password manager.</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setConfirmShow(false)}>
                  Cancel
                </Button>
                <Button
                  autoFocus
                  onClick={() => {
                    setConfirmShow(false);
                    setReveal(true);
                  }}
                >
                  Show key
                </Button>
              </div>
            </div>
          </Dialog>
          <Dialog
            open={confirmRemove}
            onOpenChange={(o) => !removing && setConfirmRemove(o)}
            title="Remove the key from this device?"
            description="Your account stays safe on NEAR. This device just can't sign for it anymore."
          >
            <div className="flex flex-col gap-4">
              <p className="text-body-sm text-ink-2">Export the key first if this is the only device that has it. Without it you can&apos;t trade from this account.</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={removing}>
                  Keep it
                </Button>
                <Button variant="danger" autoFocus onClick={() => void remove()} loading={removing} loadingLabel="Removing…">
                  Remove key
                </Button>
              </div>
            </div>
          </Dialog>
        </>
      ) : (
        <ImportKey accountId={accountId} onDone={() => refresh(accountId)} />
      )}
    </Card>
  );
}

function ImportKey({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const secret = useField("secret", "", (v) => (/^ed25519:[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(v.trim()) ? null : "Paste the full key, starting with ed25519:."));
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!secret.validate()) return;
    setBusy(true);
    try {
      const { KeyPair } = await import("near-api-js");
      const kp = KeyPair.fromString(secret.value.trim() as `ed25519:${string}`);
      await keystore.put("accounts", { id: accountId, publicKey: kp.getPublicKey().toString(), secretKey: secret.value.trim() });
      secret.reset("");
      onDone();
      void qc.invalidateQueries({ queryKey: ["listed", "local-key", accountId] });
      toast.success("Key imported", { description: "This device can now act for your account." });
    } catch {
      toast.error("That key isn't valid. Copy it again from the device you exported it on.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Field label="Secret key" error={secret.error} helper="From Settings → Export key on your other device.">
        <Input {...secret.bind} type="password" autoComplete="off" spellCheck={false} placeholder="ed25519:…" className="num" disabled={busy} />
      </Field>
      <Button type="submit" loading={busy} loadingLabel="Importing…" className="self-start">
        Import key
      </Button>
    </form>
  );
}

function SignOutCard({ who }: { who: string | null }) {
  const signOut = useSignOut();
  const [busy, setBusy] = useState(false);
  return (
    <Card padded className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="text-body-sm text-ink-2">
        Signed in on this browser{who ? <> as <span className="font-medium text-ink">{who}</span></> : null}.
      </p>
      <Button
        variant="secondary"
        loading={busy}
        loadingLabel="Signing out…"
        onClick={() => {
          setBusy(true);
          void signOut();
        }}
      >
        <LogOut className="size-4" strokeWidth={1.75} aria-hidden /> Sign out
      </Button>
    </Card>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-line" aria-hidden>
      {[176, 136, 88].map((h, i) => (
        <div key={i} className="grid grid-cols-1 gap-4 py-6 first:pt-0 lg:grid-cols-12 lg:gap-6 lg:py-8">
          <div className="flex flex-col gap-2 lg:col-span-4 lg:pt-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Card padded className="lg:col-span-8">
            <Skeleton className="w-full rounded-control" style={{ height: h }} />
          </Card>
        </div>
      ))}
    </div>
  );
}
