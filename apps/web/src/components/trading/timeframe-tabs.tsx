"use client";

import { motion } from "motion/react";
import { startTransition, useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion";
import { CANDLE_INTERVALS, INTERVAL_LABEL, timeframeLabel, type CandleInterval } from "./candles";

export { timeframeLabel };

export interface TimeframeTabsProps<T extends string = CandleInterval> {
  value: T;
  onChange: (v: T) => void;

  options?: readonly T[];

  labels?: Partial<Record<T, string>>;

  ariaLabels?: Partial<Record<T, string>>;

  label?: string;
  className?: string;
}

export function TimeframeTabs<T extends string = CandleInterval>({
  value,
  onChange,
  options = CANDLE_INTERVALS as unknown as readonly T[],
  labels,
  ariaLabels,
  label = "Timeframe",
  className,
}: TimeframeTabsProps<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (v: T) => startTransition(() => onChange(v));
  const aria = (o: T): string | undefined => ariaLabels?.[o] ?? (INTERVAL_LABEL as Record<string, string>)[o];

  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    select(options[next]);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn("relative inline-flex items-center", className)}>
      {options.map((o, i) => {
        const active = o === value;
        return (
          <button
            key={o}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={aria(o)}
            tabIndex={active ? 0 : -1}
            onClick={() => select(o)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "num group relative inline-flex h-11 min-w-11 items-center justify-center px-2 text-label font-medium",
              "rounded-chip outline-none transition-[color,transform] duration-[120ms] active:scale-[0.96]",
              "focus-visible:ring-2 focus-visible:ring-brand",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            <span className="relative z-10">{labels?.[o] ?? timeframeLabel(o)}</span>
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-1 inset-y-2 rounded-chip bg-fill opacity-0 transition-opacity duration-[120ms]",
                !active && "group-hover:opacity-100",
              )}
            />
            {active && (
              <motion.span
                layoutId={`tf-${id}`}
                transition={SPRING}
                aria-hidden
                className="absolute inset-x-2 bottom-1.5 h-0.5 rounded-full bg-ink"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
