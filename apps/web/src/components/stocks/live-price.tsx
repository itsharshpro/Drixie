"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { price as fmtPrice } from "@/lib/funds/format";
import { NumberRoll } from "../ui/number-roll";

const FLASH = {
  up: "color-mix(in oklab, var(--candle-up) 28%, transparent)",
  down: "color-mix(in oklab, var(--candle-down) 28%, transparent)",
};

export function useFlash<T extends HTMLElement>(value: number | null | undefined) {
  const ref = useRef<T>(null);
  const prev = useRef(value);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    const el = ref.current;
    if (!el || before == null || value == null || before === value || typeof el.animate !== "function") return;
    el.animate([{ backgroundColor: FLASH[value > before ? "up" : "down"] }, { backgroundColor: "transparent" }], {
      duration: 600,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }, [value]);
  return ref;
}

export function LivePrice({
  value,
  text,
  className,
  label,
  rollOnMount,
}: {
  value: number | null | undefined;
  text?: string;
  className?: string;
  label?: string;
  rollOnMount?: boolean;
}) {
  const ref = useFlash<HTMLSpanElement>(value);
  const shown = text ?? fmtPrice(value);
  return (
    <span ref={ref} className={cn("num -mx-1.5 inline-flex rounded-control px-1.5", className)}>
      {value == null ? <span className="text-ink-3">—</span> : <NumberRoll value={shown} label={label ?? shown} rollOnMount={rollOnMount} />}
    </span>
  );
}
