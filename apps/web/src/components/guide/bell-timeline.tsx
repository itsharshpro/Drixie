"use client";

import type { SeasonClock } from "@listed/shared";
import { Bell, Link2, Lock, TrendingUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ComponentType } from "react";
import { cn } from "@/lib/cn";
import { clockWords } from "@/lib/funds/format";
import { Countdown } from "../bell/countdown";
import { Card } from "../ui/card";
import { FundDot } from "../ui/fund-mark";

const FUNDS = ["atlas", "meridian", "orion", "nova", "kite"] as const;

const STOPS: { title: string; sub: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { title: "Managers decide", sub: "in private (commit)", icon: Lock },
  { title: "The bell rings", sub: "all five reveal", icon: Bell },
  { title: "NAV posted", sub: "on-chain, with price hash", icon: Link2 },
  { title: "Coins react", sub: "pool prices move", icon: TrendingUp },
];

const STEP_MS = 1600;

export function BellTimeline({ clock, nextBellAt, className }: { clock: SeasonClock | null; nextBellAt: string | null; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STOPS.length), STEP_MS);
    return () => clearInterval(id);
  }, [reduce]);
  const lit = (i: number) => reduce || i <= active;
  const frac = reduce ? 1 : active / (STOPS.length - 1);
  const ease = [0.2, 0.8, 0.2, 1] as const;

  return (
    <Card as="section" id="bell" aria-labelledby="guide-bell-h" className={cn("flex scroll-mt-24 flex-col p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <h2 id="guide-bell-h" className="text-body font-semibold tracking-[-0.01em] text-ink">
            One bell
          </h2>
          <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-caption font-medium text-gold-text">{clockWords(clock).everyShort}</span>
        </div>
        <p className="flex items-center gap-1.5 text-body-sm text-ink-2" aria-live="off">
          Next in <Countdown to={nextBellAt} className="num font-semibold text-ink" />
        </p>
      </div>

      <ol className="relative my-auto grid grid-cols-1 gap-3 pt-4 md:grid-cols-4 md:gap-2">
        <span className="absolute left-[12.5%] right-[12.5%] top-[38px] hidden h-0.5 rounded-full bg-fill md:block" aria-hidden>
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full bg-brand"
            initial={false}
            animate={{ width: `${frac * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.45, ease }}
          />
        </span>
        <span className="absolute bottom-[22px] left-[21px] top-[38px] w-0.5 rounded-full bg-fill md:hidden" aria-hidden>
          <motion.span
            className="absolute inset-x-0 top-0 rounded-full bg-brand"
            initial={false}
            animate={{ height: `${frac * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.45, ease }}
          />
        </span>
        {STOPS.map((s, i) => {
          const on = lit(i);
          const now = !reduce && i === active;
          const Icon = s.icon;
          return (
            <li key={s.title} className="relative flex min-w-0 items-center gap-3 md:flex-col md:gap-2 md:text-center">
              <motion.span
                className={cn(
                  "relative flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                  on ? "bg-brand text-paper" : "bg-paper text-ink-3 ring-1 ring-line",
                  now && "shadow-e2",
                )}
                animate={{ scale: now ? 1.08 : 1 }}
                transition={{ duration: reduce ? 0 : 0.25, ease }}
              >
                <Icon className="size-[18px]" strokeWidth={1.75} />
                {now && i === 1 && <span className="absolute inset-0 rounded-full bg-brand/25 motion-safe:animate-ping" aria-hidden />}
              </motion.span>
              <div className="min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">{s.title}</p>
                <p className="truncate text-caption text-ink-3">{s.sub}</p>
                {i === 1 && (
                  <span className="mt-1 flex gap-1 md:justify-center" aria-hidden>
                    {FUNDS.map((f, k) => (
                      <motion.span
                        key={f}
                        className="inline-flex"
                        initial={false}
                        animate={{ opacity: on ? 1 : 0.25, y: now ? [0, -3, 0] : 0 }}
                        transition={{ duration: reduce ? 0 : 0.35, delay: reduce ? 0 : k * 0.05, ease }}
                      >
                        <FundDot fund={f} />
                      </motion.span>
                    ))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
