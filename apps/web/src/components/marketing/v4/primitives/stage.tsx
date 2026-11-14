import type { CSSProperties, ReactNode } from "react";
import { Grain } from "./grain";

export interface StageProps {
  children?: ReactNode;
  className?: string;

  artClassName?: string;

  bleed?: string;

  archTop?: string;

  archDepth?: number;
  arch?: boolean;
  style?: CSSProperties;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  as?: "div" | "section";
}

export function Stage({
  children,
  className,
  artClassName,
  bleed = "0px",
  archTop = "56%",
  archDepth = 360,
  arch = true,
  style,
  as: Tag = "div",
  ...rest
}: StageProps) {
  return (
    <Tag className={["relative isolate", className].filter(Boolean).join(" ")} style={style} {...rest}>
      <div
        data-art
        aria-hidden
        className={["v4-stage-art", artClassName].filter(Boolean).join(" ")}
        style={{ bottom: bleed, "--arch-depth": `${archDepth}px` } as CSSProperties}
      >
        <div
          className="v4-bloom"
          data-drift="a"
          style={{ left: "-16%", top: "-38%", width: "62%", aspectRatio: "1", background: "radial-gradient(closest-side, color-mix(in oklab, var(--sky) 95%, transparent), transparent)" }}
        />
        <div
          className="v4-bloom"
          data-drift="b"
          style={{ right: "-18%", top: "4%", width: "54%", aspectRatio: "1", background: "radial-gradient(closest-side, color-mix(in oklab, var(--lavender) 80%, transparent), transparent)" }}
        />
        <div
          className="v4-bloom"
          data-drift="c"
          style={{ left: "50%", bottom: "-46%", width: "86%", aspectRatio: "1.4", background: "radial-gradient(closest-side, color-mix(in oklab, var(--pink) 80%, transparent), transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 52% 46% at 50% 26%, #fff 0%, color-mix(in oklab, #fff 70%, transparent) 45%, transparent 100%)" }}
        />
        {arch ? (
          <div className="v4-arch" style={{ top: archTop }}>
            <div className="v4-arch-fill" />
            <div className="v4-arch-rim" />
          </div>
        ) : null}
        <Grain opacity={0.07} />
      </div>
      <div className="relative">{children}</div>
    </Tag>
  );
}
