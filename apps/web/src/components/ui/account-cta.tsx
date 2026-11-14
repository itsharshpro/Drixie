"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession, type SessionStatus } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";
import { NAV } from "./transitions";

export type AccountNeed = "key" | "account";

export type AccountStep = "loading" | "signIn" | "finishSetup" | "addDevice" | "ready";

export function accountStep(status: SessionStatus, need: AccountNeed = "key"): AccountStep {
  switch (status) {
    case "loading":
      return "loading";
    case "error":
    case "signedOut":
      return "signIn";
    case "needsAccount":
      return "finishSetup";
    case "needsKey":
      return need === "account" ? "ready" : "addDevice";
    case "ready":
      return "ready";
  }
}

export function accountStepLabel(step: Exclude<AccountStep, "loading" | "ready">, verb?: string): string {
  if (step === "signIn") return verb ? `Sign in to ${verb}` : "Sign in";
  if (step === "finishSetup") return "Finish setup";
  return "Add this device";
}

function signinHref(pathname: string | null): string {
  return pathname && pathname !== "/signin" ? `/signin?next=${encodeURIComponent(pathname)}` : "/signin";
}

export interface AccountCtaProps {

  children: ReactNode;

  onClick?: () => void;

  href?: string;

  verb?: string;
  need?: AccountNeed;

  variant?: "primary" | "secondary";
  block?: boolean;

  icon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  "aria-label"?: string;
}

export function AccountCta({
  children,
  onClick,
  href,
  verb,
  need = "key",
  variant = "primary",
  block,
  icon,
  loading,
  loadingLabel,
  disabled,
  className,
  type = "button",
  ...aria
}: AccountCtaProps) {
  const session = useSession();
  const pathname = usePathname();
  const step = accountStep(session.status, need);

  if (step === "loading") {
    return <Skeleton className={cn("h-11 rounded-control", block ? "w-full" : "w-32", className)} />;
  }
  if (step !== "ready") {
    const to = step === "addDevice" ? "/app/settings" : signinHref(pathname);
    return (
      <Button asChild variant={variant} block={block} className={className}>
        <Link href={to} transitionTypes={[...NAV.forward]}>
          {accountStepLabel(step, verb)}
        </Link>
      </Button>
    );
  }
  if (href) {
    return (
      <Button asChild variant={variant} block={block} className={className}>
        <Link href={href} transitionTypes={[...NAV.forward]} aria-label={aria["aria-label"]}>
          {icon}
          {children}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      type={type}
      variant={variant}
      block={block}
      onClick={onClick}
      loading={loading}
      loadingLabel={loadingLabel}
      disabled={disabled}
      className={className}
      aria-label={aria["aria-label"]}
    >
      {icon}
      {children}
    </Button>
  );
}

const PROMPT: Record<"signIn" | "finishSetup" | "addDevice", { title: (verb: string) => string; body: string }> = {
  signIn: { title: (verb) => `Sign in to ${verb}`, body: "It takes one passkey and no seed phrase." },
  finishSetup: { title: () => "Finish setting up your account", body: "Pick a name and we'll create your account. No seed phrase." },
  addDevice: { title: () => "Add this device", body: "Your account key isn't on this device yet. Import it in Settings." },
};

export function AccountPrompt({
  verb,
  need = "account",
  children,
  className,
  compact,
}: {

  verb: string;
  need?: AccountNeed;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const session = useSession();
  const pathname = usePathname();
  const step = accountStep(session.status, need);
  if (step === "ready") return <>{children}</>;
  if (step === "loading") {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4 px-6", compact ? "py-10" : "py-16", className)} aria-hidden>
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-11 w-32 rounded-control" />
      </div>
    );
  }
  const copy = PROMPT[step];
  const to = step === "addDevice" ? "/app/settings" : signinHref(pathname);
  return (
    <EmptyState
      icon="key"
      title={copy.title(verb)}
      body={copy.body}
      compact={compact}
      className={className}
      action={
        <Button asChild>
          <Link href={to} transitionTypes={[...NAV.forward]}>
            {accountStepLabel(step)}
          </Link>
        </Button>
      }
    />
  );
}
