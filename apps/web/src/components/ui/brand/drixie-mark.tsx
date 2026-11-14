import type { CSSProperties } from "react";
import { GLYPH, GLYPH_SM, TILE } from "./geometry";

export type DrixieMarkTone =

  | "brand"

  | "inverse"

  | "mono";

export interface DrixieMarkProps {

  size?: number;
  tone?: DrixieMarkTone;
  className?: string;
  style?: CSSProperties;

  title?: string;
}

export function a11y(title?: string) {
  return title ? ({ role: "img", "aria-label": title } as const) : ({ "aria-hidden": true } as const);
}

export function DrixieMark({ size = 24, tone = "brand", className, style, title }: DrixieMarkProps) {
  const glyph = size <= 20 ? GLYPH_SM : GLYPH;
  const tile = tone === "brand" ? "var(--brand, #2B44D9)" : "var(--paper, #FFFFFF)";
  const ink = tone === "brand" ? "var(--paper, #FFFFFF)" : "var(--brand, #2B44D9)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} style={{ display: "block", flexShrink: 0, ...style }} focusable="false" {...a11y(title)}>
      {tone === "mono" ? (
        <path d={TILE + glyph} fill="currentColor" fillRule="evenodd" />
      ) : (
        <>
          <path d={TILE} fill={tile} />
          <path d={glyph} fill={ink} fillRule="evenodd" />
        </>
      )}
    </svg>
  );
}
