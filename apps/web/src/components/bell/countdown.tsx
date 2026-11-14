"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatCountdown } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/cn";
import { DUR, EASE } from "@/lib/motion";
import { NumberRoll } from "../ui/number-roll";
import { Skeleton } from "../ui/skeleton";

type Mode = "count" | "due" | "ringing";

export function Countdown({ to, className, ringing }: { to: string | null; className?: string; ringing?: boolean }) {
  const now = useNow(1000);
  const reduce = useReducedMotion();
  if (!to) return <span className={cn("num text-ink-3", className)}>—</span>;
  if (now === null) return <Skeleton className={cn("inline-block h-[1lh] w-28 rounded-control align-middle", className)} />;
  const ms = Date.parse(to) - now;
  const mode: Mode = ringing ? "ringing" : ms <= 0 ? "due" : "count";
  return (
    <span className={cn("inline-grid whitespace-nowrap [&>*]:[grid-area:1/1]", className)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={mode}
          className={cn("inline-flex", mode !== "count" && "num text-gold-text")}
          initial={{ opacity: 0, y: reduce ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -6 }}
          transition={{ duration: DUR.standard, ease: EASE }}
        >
          {mode === "count" ? (
            <NumberRoll value={formatCountdown(ms)} rollOnMount={false} duration={400} label={`${formatCountdown(ms)} remaining`} />
          ) : mode === "due" ? (
            "Due now"
          ) : (
            "Ringing…"
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function useIsDue(to: string | null): boolean {
  const now = useNow(1000);
  return !!to && now !== null && Date.parse(to) <= now;
}

export function usePeriodProgress(to: string | null, periodMs: number | null): number | null {
  const now = useNow(1000);
  if (!to || !periodMs || periodMs <= 0 || now === null) return null;
  const left = Date.parse(to) - now;
  return Math.min(1, Math.max(0, 1 - left / periodMs));
}
