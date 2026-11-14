"use client";

import type { FundRiskCaps, Mandate } from "@listed/shared";
import { cn } from "@/lib/cn";
import { fundCharacter, mandateChips, RISK_HELP, RISK_LABEL, RISK_SHORT, RISK_STEPS, type RiskLevel } from "@/lib/funds/character";
import { Tooltip } from "./tooltip";

const RISK_TONE: Record<RiskLevel, { chip: string; bar: string }> = {
  low: { chip: "bg-up-soft text-up", bar: "bg-up" },
  medium: { chip: "bg-gold-soft text-gold-text", bar: "bg-gold" },
  high: { chip: "bg-down-soft text-down", bar: "bg-down" },
  very_high: { chip: "bg-down text-paper", bar: "bg-paper" },
};

export function RiskMeter({ level, className }: { level: RiskLevel; className?: string }) {
  const steps = RISK_STEPS[level];
  return (
    <span aria-hidden className={cn("inline-flex h-3 items-end gap-[2px]", className)}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-[1px] transition-colors duration-200", i <= steps ? RISK_TONE[level].bar : "bg-current opacity-25")}
          style={{ height: 4 + i * 2 }}
        />
      ))}
    </span>
  );
}

export function RiskBadge({
  fund,
  mandate,
  level,
  short,
  className,
}: {
  fund?: string;
  mandate?: Mandate | null;
  level?: RiskLevel;

  short?: boolean;
  className?: string;
}) {
  const lv = level ?? fundCharacter(fund ?? "", mandate).risk;
  return (
    <Tooltip content={RISK_HELP[lv]}>
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption font-medium",
          RISK_TONE[lv].chip,
          className,
        )}
      >
        <RiskMeter level={lv} />
        {short ? RISK_SHORT[lv] : RISK_LABEL[lv]}
        {short && <span className="sr-only"> risk</span>}
      </span>
    </Tooltip>
  );
}

export function PremiumChip({ premium, className, compact }: { premium: number | null | undefined; className?: string; compact?: boolean }) {
  if (premium === null || premium === undefined || !Number.isFinite(premium)) {
    return <span className={cn("text-caption text-ink-3", className)}>No coin price</span>;
  }
  const flat = Math.abs(premium) < 0.05;
  const up = premium > 0;
  const text = flat ? "At NAV" : `${up ? "+" : "−"}${Math.abs(premium).toFixed(1)}%${compact ? "" : up ? " premium" : " discount"}`;
  const help = flat
    ? "The coin trades at its NAV."
    : `The coin trades ${Math.abs(premium).toFixed(1)}% ${up ? "above" : "below"} its NAV. Buying in at NAV ${up ? "is cheaper than the pool right now" : "costs more than the pool right now"}.`;
  return (
    <Tooltip content={help}>
      <span
        className={cn(
          "num inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-chip px-1.5 text-caption font-medium",
          flat ? "bg-fill text-ink-2" : up ? "bg-up-soft text-up" : "bg-down-soft text-down",
          className,
        )}
      >
        {text}
        {compact && !flat && <span className="sr-only">{up ? " premium" : " discount"}</span>}
      </span>
    </Tooltip>
  );
}

export type MoveKind = "enter" | "exit" | "up" | "down" | "same";

export function MoveChip({
  asset,
  deltaBps,
  kind,
  className,
}: {
  asset: string;
  deltaBps: number;
  kind?: MoveKind;
  className?: string;
}) {
  const k: MoveKind = kind ?? (deltaBps > 0 ? "up" : deltaBps < 0 ? "down" : "same");
  const up = deltaBps > 0;
  const flat = deltaBps === 0;
  const v = Math.abs(deltaBps) / 100;
  const amount = v >= 1 ? v.toFixed(0) : v.toFixed(1);
  const label = asset.replace(/\.NS$/, "");
  return (
    <span
      className={cn(
        "num inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-caption font-medium transition-transform duration-150 hover:-translate-y-px",
        flat ? "bg-fill text-ink-2" : up ? "bg-up-soft text-up" : "bg-down-soft text-down",
        className,
      )}
    >
      <span>{flat ? "±0%" : `${up ? "+" : "−"}${amount}%`}</span>
      <span className="font-sans font-semibold text-ink">{label}</span>
      {k === "enter" && <span className="font-sans text-[10px] uppercase tracking-[0.06em] text-ink-3">new</span>}
      {k === "exit" && <span className="font-sans text-[10px] uppercase tracking-[0.06em] text-ink-3">out</span>}
      <span className="sr-only">{flat ? "unchanged" : up ? "weight raised" : "weight cut"}</span>
    </span>
  );
}

export function MandateChips({ caps, className, tone = "paper" }: { caps: FundRiskCaps | null | undefined; className?: string; tone?: "paper" | "fill" }) {
  const chips = mandateChips(caps);
  if (!chips.length) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((c) => (
        <span
          key={c}
          className={cn(
            "num inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-caption text-ink-2",
            tone === "paper" ? "bg-paper/80 shadow-[0_0_0_1px_var(--line)]" : "bg-fill",
          )}
        >
          {c}
        </span>
      ))}
    </span>
  );
}
