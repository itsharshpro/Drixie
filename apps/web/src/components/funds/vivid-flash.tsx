"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const FLASH = {
  up: "color-mix(in oklab, var(--candle-up) 30%, transparent)",
  down: "color-mix(in oklab, var(--candle-down) 30%, transparent)",
};

export function VividFlash({ value, children, className }: { value: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    const el = ref.current;

    if (!el || before === value || typeof el.animate !== "function") return;
    el.animate([{ backgroundColor: FLASH[value > before ? "up" : "down"] }, { backgroundColor: "transparent" }], {
      duration: 600,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }, [value]);
  return (
    <span ref={ref} className={cn("-mx-1.5 rounded-control px-1.5", className)}>
      {children}
    </span>
  );
}
