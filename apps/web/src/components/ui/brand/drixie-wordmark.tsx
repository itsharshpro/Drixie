import type { CSSProperties } from "react";
import { WORD, WORD_H, WORD_W } from "./geometry";
import { a11y, DrixieMark, type DrixieMarkTone } from "./drixie-mark";

export interface DrixieWordmarkProps {

  size?: number;
  className?: string;
  style?: CSSProperties;

  decorative?: boolean;
}

export function DrixieWordmark({ size = 14, className, style, decorative }: DrixieWordmarkProps) {
  return (
    <svg
      width={+((size * WORD_W) / WORD_H).toFixed(2)}
      height={size}
      viewBox={`0 0 ${WORD_W} ${WORD_H}`}
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
      focusable="false"
      {...a11y(decorative ? undefined : "Drixie")}
    >
      <path d={WORD} fill="currentColor" />
    </svg>
  );
}

export interface DrixieLogoProps {

  size?: number;

  tone?: Exclude<DrixieMarkTone, "mono">;
  className?: string;

  decorative?: boolean;
}

export function DrixieLogo({ size = 24, tone = "brand", className, decorative }: DrixieLogoProps) {
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Drixie" })}
      className={className ?? "text-ink"}
      style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.3125 * 2) / 2 }}
    >
      <DrixieMark size={size} tone={tone} />
      <DrixieWordmark size={Math.round(size * 0.5612 * 2) / 2} decorative />
    </span>
  );
}
