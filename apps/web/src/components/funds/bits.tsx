"use client";

import type { BrainTier, Mandate } from "@listed/shared";
import { motion, useReducedMotion } from "motion/react";
import { Brain, ShieldAlert, ShieldCheck, Shield } from "lucide-react";
import { cn } from "@/lib/cn";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { pct } from "@/lib/funds/format";
import { BRAIN_LABEL, BRAIN_RULE, fundColorVar, MANDATE_LABEL, MANDATE_LINE, reputationTone } from "@/lib/funds/meta";
import { Badge } from "../ui/badge";
import { Tooltip } from "../ui/tooltip";

const REP_TONE = { red: "down", amber: "gold", green: "up" } as const;
const REP_ICON = { red: ShieldAlert, amber: Shield, green: ShieldCheck } as const;
const REP_HELP = {
  red: "Under 40: other AI funds won't buy its coin, and it gets worse deal terms.",
  amber: "40 to 59: watch it. Under 40, other funds stop buying its coin.",
  green: "60 or more: trusted. It started the season at 60.",
} as const;

export function ReputationBadge({ score, className, label = false }: { score: number; className?: string; label?: boolean }) {
  const tone = reputationTone(score);
  const Icon = REP_ICON[tone];
  return (
    <Tooltip content={REP_HELP[tone]}>
      <span className={cn("inline-flex", className)}>
        <Badge tone={REP_TONE[tone]} className="num gap-1">
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
          {label && <span className="font-sans">Reputation</span>}
          {Math.round(score)}
          <span className="sr-only"> reputation out of 100</span>
        </Badge>
      </span>
    </Tooltip>
  );
}

export function MandateChip({ mandate, className }: { mandate: Mandate; className?: string }) {
  return (
    <Tooltip content={MANDATE_LINE[mandate]}>
      <span className={cn("inline-flex", className)}>
        <Badge tone="neutral">{MANDATE_LABEL[mandate]}</Badge>
      </span>
    </Tooltip>
  );
}

export function PremiumTag({ premium, className }: { premium: number | null; className?: string }) {
  if (premium === null || !Number.isFinite(premium)) return <span className={cn("text-caption text-ink-3", className)}>No pool price</span>;
  const flat = Math.abs(premium) < 0.05;
  return (
    <span className={cn("num whitespace-nowrap text-caption", flat ? "text-ink-3" : premium > 0 ? "text-up" : "text-down", className)}>
      {flat ? "At NAV" : `${pct(premium)} ${premium > 0 ? "premium" : "discount"}`}
    </span>
  );
}

export function BrainChip({ tier, className }: { tier: BrainTier; className?: string }) {
  return (
    <Tooltip content={`${BRAIN_RULE[tier]}. Bigger funds afford a better AI; every call is billed to the fund.`}>
      <span className={cn("inline-flex", className)}>
        <Badge tone={tier === "best" ? "brand" : "neutral"} className="gap-1">
          <Brain className="size-3.5" strokeWidth={1.75} aria-hidden />
          {BRAIN_LABEL[tier]}
        </Badge>
      </span>
    </Tooltip>
  );
}

export function FluidNavSpark({ fund, values, height = 40, label, className }: { fund: string; values: readonly number[]; height?: number; label?: string; className?: string }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("w-full", className)} style={{ height }}>
      {size.width > 0 && <NavSpark fund={fund} values={values} width={Math.floor(size.width)} height={height} label={label} />}
    </div>
  );
}

export function NavSpark({
  fund,
  values,
  width = 112,
  height = 32,
  className,
  label,
}: {
  fund: string;
  values: readonly number[];
  width?: number;
  height?: number;
  className?: string;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) {
    return (
      <svg width={width} height={height} className={className} role="img" aria-label={label ?? "Not enough NAV posts yet"}>
        <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="var(--line-strong)" strokeDasharray="3 4" />
      </svg>
    );
  }
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || Math.abs(hi) * 0.001 || 1;
  const pad = 3;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * width, pad + (1 - (y - lo) / span) * (height - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const last = pts[pts.length - 1]!;
  const color = fundColorVar(fund);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)} role="img" aria-label={label ?? "NAV line"}>
      <path d={`${d}L${width},${height}L0,${height}Z`} fill={color} opacity={0.1} />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}
