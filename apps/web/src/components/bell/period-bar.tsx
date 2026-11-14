"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { usePeriodProgress } from "./countdown";

export function PeriodBar({ to, periodMs, className }: { to: string | null; periodMs: number | null; className?: string }) {
  const progress = usePeriodProgress(to, periodMs);
  const reduce = useReducedMotion();
  const resetting = progress !== null && progress < 0.05;
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-fill", className)}
      role="progressbar"
      aria-label="Time since the last bell"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
    >
      {progress !== null && (
        <motion.div
          className="h-full origin-left rounded-full bg-gold"
          initial={false}
          animate={{ scaleX: progress }}
          transition={reduce ? { duration: 0 } : resetting ? { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] } : { duration: 1, ease: "linear" }}
        />
      )}
    </div>
  );
}
