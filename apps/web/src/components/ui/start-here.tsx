"use client";

import { Bell, Check, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useNow } from "@/lib/hooks/use-now";
import { fundName } from "@/lib/funds/meta";
import { usePickedFund, useSavedProfile } from "@/lib/funds/local";
import { useFundPortfolio } from "@/lib/funds/queries";
import { EASE } from "@/lib/motion";
import { START_HERE_KEY } from "../shell/sidebar-script";
import { Term } from "./term";
import { AccountCta } from "./account-cta";
import { Button } from "./button";
import { CARD_TITLE } from "./card";
import { Skeleton } from "./skeleton";
import { startSteps, type StepState } from "./start-steps";
import { NAV } from "./transitions";

export { startSteps, type StepState };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {

  }
}

const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let dismissedCache: boolean | null = null;
function dismissed(): boolean {
  if (dismissedCache === null) dismissedCache = read(START_HERE_KEY) === "off";
  return dismissedCache;
}
function setDismissed(): void {
  dismissedCache = true;
  write(START_HERE_KEY, "off");
  try {
    document.documentElement.setAttribute("data-start", "off");
  } catch {

  }
  listeners.forEach((l) => l());
}

export function StartHere({ fundsHref = "#funds", nextBellAt, className }: { fundsHref?: string; nextBellAt?: string | null; className?: string }) {
  const reduce = useReducedMotion();
  const isDismissed = useSyncExternalStore(subscribe, dismissed, () => false);
  const hydrated = useHydrated();
  const session = useSession();
  const profile = useSavedProfile();
  const picked = usePickedFund();
  const portfolio = useFundPortfolio(session.status === "ready" ? session.accountId : null);
  const now = useNow(1000);

  const held = (portfolio.data?.positions ?? []).filter((p) => p.coinsNum > 0).length;
  const pending = portfolio.data?.pendingOrders.length ?? 0;
  const invested =
    session.status === "loading"
      ? null
      : session.status !== "ready"
        ? 0
        : portfolio.data
          ? held + pending
          : portfolio.isError
            ? 0
            : null;
  const steps = startSteps({ profile: hydrated ? !!profile : null, picked: !!picked, invested });
  const allDone = steps.every((s) => s === "done");

  useEffect(() => {
    if (allDone) write(START_HERE_KEY, "off");
  }, [allDone]);
  useEffect(
    () => () => {
      dismissedCache = null;
    },
    [],
  );

  const pickTarget = picked ?? profile?.funds[0] ?? null;
  const bellAt = nextBellAt ? Date.parse(nextBellAt) : null;

  const items: StepItem[] = [
    {
      n: 1,
      state: steps[0],
      title: "Take the risk check",
      body: "Three quick questions. We match you to the funds whose style fits you.",
      doneBody: profile ? `You're ${profile.label.toLowerCase()}. Your best match is ${fundName(profile.funds[0] ?? "")}.` : "Done.",
      action: (
        <Button asChild size="md" variant={steps[0] === "current" ? "primary" : "secondary"}>
          <Link href="/app/start" transitionTypes={NAV.forward}>
            {steps[0] === "done" ? "Retake it" : "Start the check"}
          </Link>
        </Button>
      ),
    },
    {
      n: 2,
      state: steps[1],
      title: "Pick a fund",
      body: <>Compare the five managers below: <Term id="nav">NAV</Term>, return vs the market and <Term id="reputation">reputation</Term>.</>,
      doneBody: pickTarget ? `You picked ${fundName(pickTarget)}.` : "You picked a fund.",
      action:
        steps[1] === "done" && pickTarget ? (
          <Button asChild size="md" variant="secondary">
            <Link href={`/app/f/${pickTarget}`} transitionTypes={NAV.forward}>
              Open {fundName(pickTarget)}
            </Link>
          </Button>
        ) : (
          <Button asChild size="md" variant={steps[1] === "current" ? "primary" : "secondary"}>
            <a href={fundsHref}>See the funds</a>
          </Button>
        ),
    },
    {
      n: 3,
      state: steps[2],
      title: "Buy in",
      body: <>Your money buys coins at the next <Term id="nav">NAV</Term>, right after the <Term id="rebalance-bell">rebalance bell</Term>.</>,
      doneBody: held > 0 ? `You hold coins in ${held} ${held === 1 ? "fund" : "funds"}.` : "Your buy-in fills at the next NAV post.",
      action:
        steps[2] === "done" ? (
          <Button asChild size="md" variant="secondary">
            <Link href="/app/portfolio" transitionTypes={NAV.lateral}>
              See portfolio
            </Link>
          </Button>
        ) : session.status === "ready" ? (
          pickTarget ? (
            <Button asChild size="md" variant={steps[2] === "current" ? "primary" : "secondary"}>
              <Link href={`/app/f/${pickTarget}?sheet=buy`} transitionTypes={NAV.forward}>
                Buy into {fundName(pickTarget)}
              </Link>
            </Button>
          ) : (
            <span className="inline-flex h-11 items-center gap-2 text-body-sm text-ink-2">
              <Bell className="size-4 text-ink-3" aria-hidden />
              {bellAt !== null && now !== null ? (
                bellAt > now ? (
                  <>
                    Next bell in <span className="num font-medium text-ink">{formatCountdown(bellAt - now)}</span>
                  </>
                ) : (
                  "The bell is ringing now"
                )
              ) : (
                "Pick a fund first"
              )}
            </span>
          )
        ) : (
          <AccountCta href={pickTarget ? `/app/f/${pickTarget}?sheet=buy` : fundsHref} verb="buy in" need="account" variant={steps[2] === "current" ? "primary" : "secondary"}>
            Buy in
          </AccountCta>
        ),
    },
  ];

  return (
    <AnimatePresence initial={false}>
      {!isDismissed && (
        <motion.section
          key="start-here"
          data-start-here
          aria-labelledby="start-here-h"
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.24, ease: EASE } }}
          className={cn("relative overflow-hidden rounded-card bg-paper shadow-e1", className)}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5 md:px-6 md:pt-6">
            <div className="min-w-0">
              <p className="text-caption font-medium text-brand">{allDone ? "All set" : "Start here"}</p>
              <h2 id="start-here-h" className={cn(CARD_TITLE, "mt-1")}>
                {allDone ? "You back an AI fund manager" : "Back an AI fund manager in three steps"}
              </h2>
            </div>
            <button
              type="button"
              onClick={setDismissed}
              aria-label="Hide the start guide"
              className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-3 transition-colors duration-150 hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <ol className="mt-4 hidden border-t border-line md:grid md:grid-cols-3">
            {items.map((it) => (
              <Step key={it.n} {...it} />
            ))}
          </ol>
          <MobileStep items={items} />
          <div className="border-t border-line px-5 py-3 md:px-6">
            <Link href="/app/guide" className="inline-flex min-h-11 items-center gap-1.5 text-body-sm font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              How Drixie works: what the managers do, and every word explained →
            </Link>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

interface StepItem {
  n: number;
  state: StepState;
  title: string;
  body: ReactNode;
  doneBody: ReactNode;
  action: ReactNode;
}

function Circle({ n, state }: { n: number; state: StepState }) {
  const done = state === "done";
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold transition-colors duration-200",
        done ? "bg-up text-paper" : state === "current" ? "bg-ink text-paper" : "bg-fill text-ink-2",
      )}
      aria-hidden
    >
      {done ? <Check className="size-4" strokeWidth={2.25} /> : <span className="num">{n}</span>}
    </span>
  );
}

function Step({ n, state, title, body, doneBody, action }: StepItem) {
  const done = state === "done";
  return (
    <li
      className="relative flex flex-col gap-3 border-line px-6 py-5 [&:not(:first-child)]:border-l"
      aria-current={state === "current" ? "step" : undefined}
    >
      <div className="flex items-center gap-3">
        <Circle n={n} state={state} />
        <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
      </div>
      <p className="min-h-10 text-body-sm text-ink-2 md:max-lg:min-h-15">
        <span className="sr-only">{done ? "Done. " : state === "current" ? "Next step. " : ""}</span>
        {done ? doneBody : body}
      </p>
      <div className="flex h-11 items-center">{state === "loading" ? <Skeleton className="h-11 w-32 rounded-control" /> : action}</div>
    </li>
  );
}

function MobileStep({ items }: { items: StepItem[] }) {
  const loading = items[0]!.state === "loading";
  const i = loading ? 0 : Math.max(0, items.findIndex((it) => it.state === "current"));
  const focus = items.every((it) => it.state === "done") ? items[items.length - 1]! : items[i]!;
  const done = focus.state === "done";
  return (
    <div className="mt-4 border-t border-line px-5 pb-5 pt-4 md:hidden">
      <div className="flex gap-1.5" aria-hidden>
        {items.map((it) => (
          <span
            key={it.n}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              it.state === "done" ? "bg-up" : it.state === "current" ? "bg-ink" : "bg-fill",
            )}
          />
        ))}
      </div>
      <ol className="sr-only">
        {items.map((it) => (
          <li key={it.n}>
            {it.title}: {it.state === "done" ? "done" : it.state === "current" ? "next" : "to do"}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-start gap-3">
        <Circle n={focus.n} state={focus.state} />
        <div className="min-w-0 flex-1">
          <p className="text-caption text-ink-3">
            Step <span className="num">{focus.n}</span> of 3
          </p>
          <h3 className="text-body-sm font-semibold text-ink">{focus.title}</h3>
          <p className="mt-1 min-h-10 text-body-sm text-ink-2">{done ? focus.doneBody : focus.body}</p>
          <div className="mt-3 flex h-11 items-center">
            {loading ? <Skeleton className="h-11 w-32 rounded-control" /> : focus.action}
          </div>
        </div>
      </div>
    </div>
  );
}
