"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useEdgeFade } from "@/lib/hooks/use-edge-fade";

export function HScroll({
  children,
  className,
  innerClassName,
  label,
  bleed = false,
}: {
  children: ReactNode;

  className?: string;

  innerClassName?: string;

  label?: string;

  bleed?: boolean;
}) {
  const ref = useEdgeFade<HTMLDivElement>();
  return (
    <div ref={ref} role={label ? "group" : undefined} aria-label={label} className={cn("hscroll", bleed && "-mx-5 px-5 md:mx-0 md:px-0", className)}>
      <div className={cn("flex w-max min-w-full items-center gap-2", innerClassName)}>{children}</div>
    </div>
  );
}
