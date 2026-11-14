"use client";

import { Fragment, useRef, type CSSProperties } from "react";
import { useInView } from "./in-view";

type Tag = "h1" | "h2" | "h3" | "p" | "span" | "div";

export interface WordRevealProps {

  text: string | string[];
  as?: Tag;
  className?: string;

  play?: "load" | "view";

  delay?: number;
  id?: string;
  style?: CSSProperties;
}

export function WordReveal({ text, as = "h2", className, play = "view", delay = 0, id, style }: WordRevealProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -8% 0px" });
  const lines = Array.isArray(text) ? text : [text];
  let i = 0;
  const content = lines.map((line, li) => {
    const words = line.split(" ").filter(Boolean);
    return (
      <Fragment key={li}>
        <span className="block">
          {words.map((raw, wi) => {
            const muted = raw.startsWith("~") || raw.endsWith("~");
            const w = raw.replace(/~/g, "");
            const idx = i++;
            return (
              <Fragment key={wi}>
                <span className="v4-word" data-muted={muted || undefined} style={{ "--i": idx } as CSSProperties}>
                  {w}
                </span>
                {wi < words.length - 1 ? " " : null}
              </Fragment>
            );
          })}
        </span>
      </Fragment>
    );
  });
  const Tag = as as "h2";
  return (
    <Tag
      ref={ref}
      id={id}
      className={["v4-words", className].filter(Boolean).join(" ")}
      data-play={play}
      data-inview={play === "view" ? (inView ? "true" : "false") : undefined}
      style={{ ...style, "--d": `${delay}ms` } as CSSProperties}
    >
      {content}
    </Tag>
  );
}
