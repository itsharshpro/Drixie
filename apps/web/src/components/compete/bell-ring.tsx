"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { NumberRoll } from "../ui/number-roll";

export function BellRing({ nextBellAt, bellSecs, size = 56, className }: { nextBellAt: string | null; bellSecs: number; size?: number; className?: string }) {
  const now = useNow(1000);
  const reduce = useReducedMotion();
  const ms = nextBellAt && now !== null ? Math.max(0, Date.parse(nextBellAt) - now) : null;
  const frac = ms === null ? 0 : Math.max(0, Math.min(1, ms / (bellSecs * 1000)));
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const hot = ms !== null && ms > 0 && ms <= 10_000;
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={hot ? "var(--candle-down)" : "var(--gold)"}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className="transition-[stroke-dashoffset,stroke] duration-1000 ease-linear"
        />
      </svg>
      {hot && !reduce && (
        <motion.span
          key={Math.ceil((ms ?? 0) / 1000)}
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-candle-down"
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ opacity: 0, scale: 1.25 }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        />
      )}
      <span className="num relative text-caption font-semibold text-ink">
        {ms === null ? "—" : ms === 0 ? "now" : <NumberRoll value={formatCountdown(ms)} duration={300} />}
      </span>
    </span>
  );
}
