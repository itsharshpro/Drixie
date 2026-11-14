"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const FLASH = { up: "var(--up-soft)", down: "var(--down-soft)" };

export function PriceFlash({ value, children, className }: { value: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    if (value === prev.current || !ref.current) return;
    const dir = value > prev.current ? "up" : "down";
    prev.current = value;
    if (typeof ref.current.animate !== "function") return;
    ref.current.animate([{ backgroundColor: FLASH[dir] }, { backgroundColor: "transparent" }], {
      duration: 600,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }, [value]);

  return (
    <span ref={ref} className={cn("-mx-1 rounded-chip px-1", className)}>
      {children}
    </span>
  );
}
