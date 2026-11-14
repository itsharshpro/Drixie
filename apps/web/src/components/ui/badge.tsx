import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "brand" | "up" | "down" | "gold" | "solid";
type Tone = BadgeTone;

const TONES: Record<Tone, string> = {
  neutral: "bg-fill text-ink-2",
  brand: "bg-brand-soft text-brand",
  up: "bg-up-soft text-up",
  down: "bg-down-soft text-down",

  gold: "bg-gold-soft text-gold-text",
  solid: "bg-ink text-paper",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
  dotClassName,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;

  dotClassName?: string;
}) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-2 whitespace-nowrap rounded-full px-3 text-caption font-medium", TONES[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dotClassName ?? "bg-current")} aria-hidden />}
      {children}
    </span>
  );
}

export function RankBadge({ rank, size = 28, className }: { rank: number; size?: 24 | 28 | 40; className?: string }) {
  const tone = rank === 1 ? "bg-gold-soft text-gold-text" : rank <= 3 ? "bg-ink text-paper" : "bg-fill text-ink-2";
  return (
    <span
      className={cn("num inline-flex shrink-0 items-center justify-center rounded-full font-medium", size === 40 ? "text-label" : "text-caption", tone, className)}
      style={{ width: size, height: size }}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}
