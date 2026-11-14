"use client";

import type { SeasonClock } from "@listed/shared";
import { ArrowRight, Bell, Clock3, Coins, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { clockWords } from "@/lib/funds/format";
import { Halftone, halftoneHost } from "../trading/halftone";
import { FundMark } from "../ui/fund-mark";
import { NAV } from "../ui/transitions";

const RISK_ORDER = ["atlas", "meridian", "orion", "nova", "kite"] as const;

function RiskArt() {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        {RISK_ORDER.map((f, i) => (
          <span key={f} className="transition-transform duration-200 group-hover:-translate-y-0.5" style={{ transitionDelay: `${i * 40}ms` }}>
            <FundMark fund={f} size={32} />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-caption text-ink-3">
        <span>Low</span>
        <span className="flex h-1 flex-1 gap-0.5" aria-hidden>
          <span className="flex-1 rounded-full bg-up-soft" />
          <span className="flex-[2] rounded-full bg-gold-soft" />
          <span className="flex-1 rounded-full bg-down-soft" />
        </span>
        <span>Very high</span>
      </div>
    </div>
  );
}

function Node({ icon, label, tone }: { icon: ReactNode; label: string; tone: string }) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-1">
      <span className={cn("flex size-9 items-center justify-center rounded-full", tone)}>{icon}</span>
      <span className="truncate text-caption text-ink-2">{label}</span>
    </span>
  );
}

function BuyArt() {
  const arrow = <ArrowRight className="size-3.5 shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />;
  return (
    <div className="flex w-full items-center justify-between gap-1">
      <Node icon={<Wallet className="size-4" strokeWidth={1.75} />} label="NEAR in" tone="bg-fill text-ink-2" />
      {arrow}
      <Node icon={<Clock3 className="size-4" strokeWidth={1.75} />} label="Waits" tone="bg-gold-soft text-gold-text" />
      {arrow}
      <Node icon={<Coins className="size-4" strokeWidth={1.75} />} label="Coins at NAV" tone="bg-brand-soft text-brand" />
    </div>
  );
}

function BellArt({ every }: { every: string }) {
  return (
    <div className="flex w-full items-center gap-4">
      <span className="relative flex size-11 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-gold-soft motion-safe:animate-ping motion-safe:[animation-duration:2.4s]" aria-hidden />
        <span className="relative flex size-11 items-center justify-center rounded-full bg-gold-soft text-gold-text">
          <Bell className="size-5 transition-transform duration-200 group-hover:-rotate-12 motion-reduce:transition-none" strokeWidth={1.75} />
        </span>
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex -space-x-1.5">
          {RISK_ORDER.map((f) => (
            <FundMark key={f} fund={f} size={24} className="ring-2 ring-paper" />
          ))}
        </div>
        <span className="truncate text-caption text-ink-2">{every}</span>
      </div>
    </div>
  );
}

interface Step {
  n: number;
  title: string;
  line: string;
  href: string;
  pastel: string;
  dots: string;
  art: ReactNode;
}

export function ThreeSteps({ clock, className }: { clock: SeasonClock | null; className?: string }) {
  const words = clockWords(clock);
  const steps: Step[] = [
    { n: 1, title: "Pick by risk", line: "Five managers, calm to wild.", href: "/app/start", pastel: "bg-sky", dots: "var(--viz-cobalt)", art: <RiskArt /> },
    { n: 2, title: "Buy in at NAV", line: "Your order fills at the next NAV.", href: "/app", pastel: "bg-mint", dots: "var(--viz-teal)", art: <BuyArt /> },
    {
      n: 3,
      title: "Watch the bell",
      line: "All five reveal their moves at once.",
      href: "/app",
      pastel: "bg-lavender",
      dots: "var(--viz-plum)",
      art: <BellArt every={`Rings ${words.everyShort}`} />,
    },
  ];
  return (
    <section id="actions" aria-label="Three steps" className={cn("scroll-mt-24", className)}>
      <span id="start" className="sr-only" />
      <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <li
            key={s.n}
            className={cn(
              "group relative flex min-w-0 flex-col overflow-hidden rounded-card p-4 shadow-e1 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-0.5 hover:shadow-e2 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
              s.pastel,
              halftoneHost,
            )}
          >
            <Halftone rows={4} cell={9} color={s.dots} opacity={0.22} fade="down" className="absolute inset-x-0 top-0" />
            <div className="relative flex h-[76px] items-center rounded-control bg-paper px-4 shadow-e1">{s.art}</div>
            <div className="relative mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-baseline gap-2 text-body font-semibold tracking-[-0.01em] text-ink">
                  <span className="num text-caption font-medium text-ink-3">{s.n}</span>
                  {s.title}
                </h2>
                <p className="mt-0.5 truncate text-body-sm text-ink-2">{s.line}</p>
              </div>
              <Link
                href={s.href}
                transitionTypes={[...NAV.lateral]}
                aria-label={`Go: ${s.title}`}
                className="-mr-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-paper/70 px-3.5 text-label font-medium text-brand transition-colors duration-150 hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.98]"
              >
                Go
                <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
