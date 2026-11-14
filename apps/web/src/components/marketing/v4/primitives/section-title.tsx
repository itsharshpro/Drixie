import type { CSSProperties, ReactNode } from "react";
import { Eyebrow } from "./eyebrow";
import { InView } from "./in-view";
import { WordReveal } from "./word-reveal";

export interface SectionTitleProps {
  eyebrow?: ReactNode;

  title: string | string[];
  sub?: ReactNode;
  align?: "center" | "left";

  id?: string;
  as?: "h1" | "h2" | "h3";
  className?: string;
}

export function SectionTitle({ eyebrow, title, sub, align = "center", id, as = "h2", className }: SectionTitleProps) {
  const center = align === "center";
  return (
    <InView
      as="header"
      className={[
        "flex flex-col gap-5",
        center ? "mx-auto max-w-[var(--v4-text-max)] items-center text-center" : "items-start text-left",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {eyebrow ? (
        <div className="v4-reveal">
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
      ) : null}
      <WordReveal as={as} id={id} text={title} className="v4-h2" play="view" delay={80} />
      {sub ? (
        <p className={["v4-body v4-reveal max-w-[560px]", center ? "mx-auto" : ""].join(" ")} style={{ "--i": 3 } as CSSProperties}>
          {sub}
        </p>
      ) : null}
    </InView>
  );
}
