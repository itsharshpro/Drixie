"use client";

import type { FundRow, RiskProfileId } from "@listed/shared";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { fundCharacter, PROFILE_LABEL, PROFILE_LINE, PROFILES } from "@/lib/funds/character";
import { Card, CARD_TITLE } from "../ui/card";
import { NAV } from "../ui/transitions";

export function matchesFor(rows: readonly FundRow[], profile: RiskProfileId | null): Set<string> {
  if (!profile) return new Set();
  return new Set(rows.filter((f) => fundCharacter(f.id, f.mandate).profile === profile).map((f) => f.id));
}

export function RiskPicker({
  value,
  onChange,
  rows,
  className,
}: {
  value: RiskProfileId | null;
  onChange: (v: RiskProfileId | null) => void;
  rows: readonly FundRow[];
  className?: string;
}) {
  const names = value ? rows.filter((f) => fundCharacter(f.id, f.mandate).profile === value).map((f) => f.name) : [];
  return (
    <Card as="section" aria-labelledby="start-h" className={cn("flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:gap-6 md:px-6", className)}>
      <div className="min-w-0 md:w-56 md:shrink-0">
        <h2 id="start-h" className={CARD_TITLE}>
          Start here
        </h2>
        <p className="text-caption text-ink-3" aria-live="polite">
          {value ? (names.length ? `Your match: ${names.join(" and ")}` : "No fund matches yet") : "How much swing can you take?"}
        </p>
      </div>
      <div role="radiogroup" aria-label="Your risk appetite" className="grid min-w-0 flex-1 grid-cols-3 gap-2">
        {PROFILES.map((p) => {
          const on = value === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? null : p)}
              className={cn(
                "flex min-h-11 min-w-0 flex-col items-center justify-center rounded-full border px-3 py-1.5 text-center outline-none",
                "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-line-strong hover:bg-fill",
              )}
            >
              <span className="truncate text-body-sm font-medium">{PROFILE_LABEL[p]}</span>
              <span className={cn("hidden truncate text-caption sm:block", on ? "text-paper/75" : "text-ink-3")}>{PROFILE_LINE[p]}</span>
            </button>
          );
        })}
      </div>
      <Link
        href="/app/start"
        transitionTypes={[...NAV.forward]}
        className="shrink-0 self-start text-caption font-medium text-ink-2 underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:underline md:self-center"
      >
        Take the full risk check
      </Link>
    </Card>
  );
}
