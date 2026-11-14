"use client";

import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "neutral" | "brand" | "up" | "down" | "gold";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-fill text-ink-2",
  brand: "bg-brand-soft text-brand",
  up: "bg-up-soft text-up",
  down: "bg-down-soft text-down",
  gold: "bg-gold-soft text-gold-text",
};

export interface ChipProps {
  children: ReactNode;
  icon?: ReactNode;

  count?: number | string | null;
  tone?: ChipTone;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  href?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  "aria-label"?: string;
}

export function Chip({ children, icon, count, tone = "neutral", selected, onClick, href, disabled, title, className, ...aria }: ChipProps) {
  const interactive = !!onClick || !!href;
  const inner = (
    <>
      {icon && <span className="inline-flex shrink-0 [&>svg]:size-3.5">{icon}</span>}
      <span className="truncate">{children}</span>
      {count !== undefined && count !== null && (
        <span className={cn("num text-caption", selected ? "text-paper/64" : "text-ink-3")}>{count}</span>
      )}
    </>
  );
  if (!interactive) {
    return (
      <span title={title} className={cn("inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-caption font-medium", TONE[tone], className)}>
        {inner}
      </span>
    );
  }
  const cls = cn(

    "relative inline-flex h-8 max-w-full shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-label font-medium",
    "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
    "outline-none transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] active:duration-[120ms]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:pointer-events-none disabled:bg-fill disabled:text-ink-3 disabled:shadow-none",
    selected
      ? "bg-ink text-paper"
      : "bg-paper text-ink-2 shadow-[0_0_0_1px_var(--line-strong)] hover:text-ink hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--ink)_28%,transparent)]",
    className,
  );
  if (href) {
    return (
      <Link href={href} title={title} aria-current={selected ? "page" : undefined} className={cls} {...aria}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={selected} className={cls} {...aria}>
      {inner}
    </button>
  );
}
