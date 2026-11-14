"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { once = true, margin = "0px 0px -12% 0px", threshold = 0 }: { once?: boolean; margin?: string; threshold?: number } = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin: margin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, margin, threshold]);
  return inView;
}

type InViewProps = {
  children?: ReactNode;
  as?: "div" | "section" | "ul" | "ol" | "li" | "header" | "footer" | "article" | "span" | "figure";
  className?: string;
  style?: CSSProperties;
  id?: string;
  once?: boolean;
  margin?: string;

  reveal?: boolean;

  delay?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export function InView({ children, as = "div", className, style, once = true, margin, reveal, delay, ...rest }: InViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin });
  const cls = [reveal ? "v4-reveal" : "", className ?? ""].filter(Boolean).join(" ") || undefined;
  const st = delay ? ({ ...style, "--d": `${delay}ms` } as CSSProperties) : style;

  const Tag = as as "div";
  return (
    <Tag ref={ref} className={cls} style={st} data-inview={inView ? "true" : "false"} {...rest}>
      {children}
    </Tag>
  );
}
