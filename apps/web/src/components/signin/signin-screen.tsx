"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CircleAlert, Fingerprint, Info, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Me } from "@listed/shared";
import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/keys";
import { useConfig } from "@/lib/api/queries";
import { hasLocalKey, humanPasskeyError, provisionAccount, signInWithPasskey, signUpWithPasskey } from "@/lib/auth/passkey";
import { useSession } from "@/lib/auth/session";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { useField } from "@/lib/hooks/use-field";
import { DUR, EASE, SPRING } from "@/lib/motion";
import { emailRule, handleRule } from "@/lib/validate";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { LINE_ICONS } from "../ui/line-icons";
import { Skeleton } from "../ui/skeleton";
import { Handoff, type HandoffInfo } from "./handoff";
import { DrixieMark } from "../ui/brand";

type Mode = "signin" | "create" | "email" | "emailSent";

export function SigninScreen() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [handoff, setHandoff] = useState<HandoffInfo | null>(null);

  useEffect(() => {
    if (!handoff && session.status === "ready") router.replace(next);
  }, [handoff, session.status, router, next]);

  if (handoff) return <Handoff info={handoff} next={next} />;
  if (session.status === "loading" || session.status === "ready") return <SigninSkeleton />;
  if (session.status === "needsAccount") return <ChooseHandle initial={session.me?.handle ?? ""} onDone={setHandoff} />;
  if (session.status === "needsKey")
    return (
      <Panel icon="key" title="Add this device" sub={`You're signed in as ${session.me?.handle ?? "your account"}, but this device doesn't have your account key yet.`}>
        <div className="flex flex-col gap-3">
          <Button asChild size="lg" block>
            <Link href="/app/settings">Import your key</Link>
          </Button>
          <Button asChild size="lg" block variant="ghost">
            <Link href="/app">Browse the market</Link>
          </Button>
        </div>
      </Panel>
    );
  return <SignedOut onDone={setHandoff} />;
}

function safeNext(n: string | null): string {
  return n && n.startsWith("/app") ? n : "/app";
}

export function Panel({ icon = "key", title, sub, children }: { icon?: keyof typeof LINE_ICONS | "brand"; title: string; sub: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [ref, size] = useElementSize<HTMLDivElement>();
  return (
    <div className="w-full">
      <div className="flex flex-col items-center gap-3 pb-8 text-center">
        <div className="flex size-16 items-center justify-center">{icon === "brand" ? <DrixieMark size={48} /> : LINE_ICONS[icon]}</div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={title}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -4 }}
            transition={{ duration: DUR.micro, ease: EASE }}
            className="flex flex-col items-center gap-2"
          >
            <h1 className="text-title font-semibold tracking-[-0.015em]">{title}</h1>
            <p className="max-w-80 text-body-sm text-ink-2">{sub}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <motion.div
        className="overflow-hidden rounded-sheet bg-paper shadow-e2"
        initial={false}
        animate={size.height ? { height: size.height } : undefined}
        transition={reduce ? { duration: 0 } : SPRING}
      >
        <div ref={ref} className="p-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function Swap({ mode, children }: { mode: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={mode}
        initial={{ opacity: 0, x: reduce ? 0 : 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: reduce ? 0 : -12 }}
        transition={{ duration: DUR.standard, ease: EASE }}
        className="flex flex-col gap-4"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function FormAlert({ message, tone = "error", action }: { message: string | null; tone?: "error" | "info"; action?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key={message}
          role={tone === "error" ? "alert" : "status"}
          initial={{ opacity: 0, y: reduce ? 0 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.standard, ease: EASE }}
          className={tone === "error" ? "flex items-start gap-2 rounded-control bg-down-soft p-3 text-caption text-down" : "flex flex-col gap-3 rounded-control bg-fill p-3 text-caption text-ink-2"}
        >
          <span className="flex items-start gap-2">
            {tone === "error" ? (
              <CircleAlert className="mt-px size-4 shrink-0" strokeWidth={2} aria-hidden />
            ) : (
              <Info className="mt-px size-4 shrink-0 text-ink" strokeWidth={1.75} aria-hidden />
            )}
            <span>{message}</span>
          </span>
          {action}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function useAccountPreview(handle: string): string | null {
  const config = useConfig();
  if (!config.data || !handle) return null;
  return `${handle}.players.${config.data.root}`;
}

function handleErrorFrom(err: unknown, handle: string): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.code === "handle_taken") return `${handle} is taken. Add a number or pick another name.`;
  if (err.code === "invalid_handle" || err.code === "bad_handle") return "Enter 3–20 lowercase letters or numbers.";
  return null;
}

function HandleField({
  field,
  serverError,
  onClearServerError,
  disabled,
  autoComplete,
}: {
  field: ReturnType<typeof useField>;
  serverError: string | null;
  onClearServerError: () => void;
  disabled: boolean;
  autoComplete?: string;
}) {
  const [checked, setChecked] = useState(false);
  const preview = useAccountPreview(field.value);
  const error = field.error ?? serverError;
  return (
    <Field
      label="Your name"
      error={error}
      success={checked && !error}
      helper={preview ? <>Your account: <span className="num text-ink">{preview}</span></> : "3–20 lowercase letters or numbers. Others see it on trades and leaderboards."}
    >
      <Input
        {...field.bind}
        onChange={(e) => {
          setChecked(false);
          onClearServerError();
          field.setValue(e.target.value.toLowerCase().replace(/\s/g, ""));
        }}
        onBlur={() => {
          field.bind.onBlur();
          setChecked(field.value.length > 0 && handleRule(field.value) === null);
        }}
        placeholder="maya"
        autoFocus
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
        disabled={disabled}
      />
    </Field>
  );
}

function SignedOut({ onDone }: { onDone: (h: HandoffInfo) => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState<null | "passkey" | "create" | "email">(null);
  const [error, setError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [emailOff, setEmailOff] = useState<string | null>(null);
  const handle = useField("handle", "", handleRule);
  const email = useField("email", "", emailRule);

  const go = (m: Mode) => {
    setError(null);
    setMode(m);
  };

  const finish = async (me: Me | null) => {
    await qc.invalidateQueries({ queryKey: qk.me() });
    const fresh = qc.getQueryData<Me | null>(qk.me()) ?? me;

    if (fresh?.accountId && (await hasLocalKey(fresh.accountId)))
      onDone({ title: fresh.handle ? `Welcome back, ${fresh.handle}` : "Welcome back", accountId: fresh.accountId, isNew: false });
  };

  const passkey = async () => {
    setError(null);
    setBusy("passkey");
    try {
      const me = await signInWithPasskey();
      await finish(me);
    } catch (err) {
      setError(humanPasskeyError(err));
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setHandleError(null);
    if (!handle.validate()) return;
    setBusy("create");
    const h = handle.value.trim().toLowerCase();
    try {
      await signUpWithPasskey(h);
      const accountId = await provisionAccount(h);
      await qc.invalidateQueries({ queryKey: qk.me() });
      onDone({ title: `You're in, ${h}`, accountId, isNew: true });
    } catch (err) {
      const fieldMsg = handleErrorFrom(err, h);
      if (fieldMsg) setHandleError(fieldMsg);
      else setError(humanPasskeyError(err));
    } finally {
      setBusy(null);
    }
  };

  const sendEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.validate()) return;
    setBusy("email");
    try {
      await api.emailStart(email.value.trim());
      go("emailSent");
    } catch (err) {

      if (err instanceof ApiError && (err.code === "email_unavailable" || err.status === 503)) setEmailOff(err.message);
      else setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const titles: Record<Mode, [string, string]> = {
    signin: ["Sign in to Drixie", "One passkey. No seed phrase, no extension."],
    create: ["Create your Drixie account", "Pick a name. Your passkey protects it, and Drixie pays the network fees."],
    email: ["Sign in with email", "We'll send you a one-time link."],
    emailSent: ["Check your inbox", `We sent a sign-in link to ${email.value}. It works once and expires soon.`],
  };

  return (
    <Panel icon={mode === "email" || mode === "emailSent" ? "letters" : mode === "signin" ? "brand" : "key"} title={titles[mode][0]} sub={titles[mode][1]}>
      <Swap mode={mode}>
        {mode === "signin" && (
          <>
            <Button size="lg" block onClick={passkey} loading={busy === "passkey"} loadingLabel="Waiting for your passkey…">
              <Fingerprint className="size-5" strokeWidth={1.75} aria-hidden /> Continue with passkey
            </Button>
            <Divider />
            <Button size="lg" block variant="secondary" onClick={() => go("create")} disabled={busy !== null}>
              Create an account <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
            </Button>
            <Button size="md" block variant="ghost" onClick={() => go("email")} disabled={busy !== null}>
              <Mail className="size-4" strokeWidth={1.75} aria-hidden /> Use email instead
            </Button>
          </>
        )}
        {mode === "create" && (
          <form onSubmit={create} className="flex flex-col gap-4" noValidate>
            <HandleField field={handle} serverError={handleError} onClearServerError={() => setHandleError(null)} disabled={busy !== null} autoComplete="username webauthn" />
            <Button type="submit" size="lg" block loading={busy === "create"} loadingLabel="Creating your account…">
              <Fingerprint className="size-5" strokeWidth={1.75} aria-hidden /> Create with passkey
            </Button>
            <BackLink onClick={() => go("signin")} disabled={busy !== null} />
          </form>
        )}
        {mode === "email" && (
          <form onSubmit={sendEmail} className="flex flex-col gap-4" noValidate>
            <Field label="Email" error={email.error}>
              <Input {...email.bind} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" autoFocus disabled={busy !== null} />
            </Field>
            <FormAlert
              tone="info"
              message={emailOff}
              action={
                <Button size="md" block onClick={() => go("signin")}>
                  <Fingerprint className="size-4" strokeWidth={1.75} aria-hidden /> Continue with passkey
                </Button>
              }
            />
            {!emailOff && (
              <Button type="submit" size="lg" block loading={busy === "email"} loadingLabel="Sending…">
                Email me a link
              </Button>
            )}
            <BackLink onClick={() => go("signin")} disabled={busy !== null} />
          </form>
        )}
        {mode === "emailSent" && (
          <>
            <Button size="lg" block variant="secondary" onClick={() => go("email")}>
              Use a different email
            </Button>
            <BackLink onClick={() => go("signin")} />
          </>
        )}
        <FormAlert message={error} />
      </Swap>
    </Panel>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-caption text-ink-3" aria-hidden>
      <span className="h-px flex-1 bg-line" /> New here? <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function BackLink({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 rounded-control text-center text-caption font-medium text-ink-2 hover:text-ink disabled:text-ink-3"
    >
      Back to sign in
    </button>
  );
}

export function ChooseHandle({ initial, onDone }: { initial: string; onDone: (h: HandoffInfo) => void }) {
  const qc = useQueryClient();
  const handle = useField("handle", initial, handleRule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setHandleError(null);
    if (!handle.validate()) return;
    setBusy(true);
    const h = handle.value.trim().toLowerCase();
    try {
      const accountId = await provisionAccount(h);
      await qc.invalidateQueries({ queryKey: qk.me() });
      onDone({ title: `You're in, ${h}`, accountId, isNew: true });
    } catch (err) {
      const fieldMsg = handleErrorFrom(err, h);
      if (fieldMsg) setHandleError(fieldMsg);
      else setError(humanPasskeyError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Choose your name" sub="We'll create your account with it. Your key is made on this device and never leaves it.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <HandleField field={handle} serverError={handleError} onClearServerError={() => setHandleError(null)} disabled={busy} autoComplete="username" />
        <Button type="submit" size="lg" block loading={busy} loadingLabel="Creating your account…">
          Create my account
        </Button>
        <FormAlert message={error} />
      </form>
    </Panel>
  );
}

export function SigninSkeleton() {
  return (
    <div className="w-full" aria-hidden>
      <div className="flex flex-col items-center gap-3 pb-8">
        <Skeleton className="size-14 rounded-card" />
        <Skeleton className="h-8 w-56 rounded-control" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="flex flex-col gap-4 rounded-sheet bg-paper p-6 shadow-e2">
        <Skeleton className="h-12 w-full rounded-control" />
        <Skeleton className="mx-auto h-3 w-24" />
        <Skeleton className="h-12 w-full rounded-control" />
        <Skeleton className="h-11 w-full rounded-control" />
      </div>
    </div>
  );
}
