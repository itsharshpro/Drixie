"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE_COLOR, type SeriesTone } from "./bar-chart";

export function Donut({
  value,
  size = 160,
  thickness = 14,
  tone = "brand",
  center,
  className,
  label,
}: {
  value: number; // 0..1
  size?: number;
  thickness?: number;
  tone?: SeriesTone;
  center?: ReactNode;
  className?: string;
  label: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - thickness) / 2;
  const color = TONE_COLOR[tone];
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={1} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap={v > 0.02 && v < 0.98 ? "round" : "butt"}
          initial={reduce ? { pathLength: v, opacity: 0 } : { pathLength: 0, opacity: 1 }}
          animate={{ pathLength: v, opacity: 1 }}
          transition={reduce ? { duration: 0.15 } : { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}
