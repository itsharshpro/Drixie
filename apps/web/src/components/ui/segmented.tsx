"use client";
import { motion } from "motion/react";
import { startTransition, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  label,
  block,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  className?: string;
  label: string;
  block?: boolean;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (v: T) => startTransition(() => onChange(v));

  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    select(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("relative inline-flex rounded-control bg-fill px-1", block && "flex w-full", className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => select(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative z-0 inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-chip font-medium transition-colors duration-[120ms]",

              "h-11 min-w-11",
              size === "sm" ? "px-3 text-caption" : "px-4 text-label",
              active ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING}
                className="absolute inset-x-0 inset-y-1 -z-10 rounded-chip bg-paper shadow-[0_0_0_1px_var(--line),0_1px_2px_color-mix(in_oklab,var(--ink)_8%,transparent)]"
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
