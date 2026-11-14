"use client";

import { ArrowDown, Coins, Layers, ShieldCheck, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { Card } from "../ui/card";

const INPUTS: { label: string; tag?: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; tone: string }[] = [
  { label: "Holdings × real prices", tag: "NAV", icon: Layers, tone: "bg-sky text-[var(--viz-cobalt)]" },
  { label: "Demand in its pool", icon: Users, tone: "bg-mint text-[var(--viz-teal)]" },
  { label: "Reputation", icon: ShieldCheck, tone: "bg-lavender text-[var(--viz-plum)]" },
];

const PATHS = ["M0 16.7 C 22 16.7, 22 50, 40 50", "M0 50 L 40 50", "M0 83.3 C 22 83.3, 22 50, 40 50"];

export function CoinDiagram({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <Card as="section" aria-labelledby="guide-coin-h" className={cn("flex flex-col p-4 md:p-5", className)}>
      <h2 id="guide-coin-h" className="text-body font-semibold tracking-[-0.01em] text-ink">
        What moves a coin
      </h2>
      <div className="mt-4 flex flex-col items-stretch md:flex-row">
        <ul className="flex min-w-0 flex-1 flex-col gap-2">
          {INPUTS.map((x, i) => {
            const Icon = x.icon;
            return (
              <li key={x.label} className="flex h-11 min-w-0 items-center gap-2">
                <span className="num w-3 shrink-0 text-center text-label font-semibold text-ink-3" aria-hidden>
                  {i === 0 ? "" : "+"}
                </span>
                <span className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control bg-canvas pl-1.5 pr-2.5 ring-1 ring-line">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[8px]", x.tone)}>
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="truncate text-body-sm font-medium text-ink">{x.label}</span>
                  {x.tag && <span className="ml-auto shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-caption font-semibold text-brand">= {x.tag}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <ArrowDown className="mx-auto my-1.5 size-4 text-ink-3 md:hidden" aria-hidden />
        <svg viewBox="0 0 40 100" preserveAspectRatio="none" className="hidden w-10 shrink-0 self-stretch md:block" aria-hidden>
          {PATHS.map((d, i) => (
            <motion.path
              key={d}
              d={d}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: [0.2, 0.8, 0.2, 1] }}
            />
          ))}
        </svg>
        <div className="flex shrink-0 items-center justify-center gap-2 rounded-card bg-brand-soft px-3 py-2.5 text-center md:w-[108px] md:flex-col md:gap-1.5 md:py-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-paper text-brand shadow-e1">
            <Coins className="size-5" strokeWidth={1.75} />
          </span>
          <span className="text-body-sm font-semibold text-ink">Coin price</span>
        </div>
      </div>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 text-body-sm">
        <span className="rounded-full bg-fill px-2 py-0.5 text-caption font-medium uppercase tracking-[0.04em] text-ink-3">example</span>
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 rounded-full bg-up-soft px-3 py-1 text-ink">
          Coin <span className="num">$10.40</span> · NAV <span className="num">$10.00</span>
          <span className="font-semibold text-up">+4% premium</span>
        </span>
      </div>
    </Card>
  );
}
