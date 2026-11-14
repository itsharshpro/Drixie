"use client";
import { useCallback, useState } from "react";

export function useInView<T extends Element = HTMLElement>(margin = "200px"): [(el: T | null) => void, boolean] {
  const [seen, setSeen] = useState(false);
  const ref = useCallback(
    (el: T | null) => {
      if (!el || seen) return;
      if (typeof IntersectionObserver === "undefined") {
        setSeen(true);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setSeen(true);
            io.disconnect();
          }
        },
        { rootMargin: margin },
      );
      io.observe(el);
      return () => io.disconnect();
    },
    [margin, seen],
  );
  return [ref, seen];
}
