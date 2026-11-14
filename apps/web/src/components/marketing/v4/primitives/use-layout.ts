"use client";

import { useSyncExternalStore } from "react";

export type TerminalLayout = "mobile" | "tablet" | "desktop";

const QUERIES = { desktop: "(min-width: 1024px)", tablet: "(min-width: 768px)" } as const;

function subscribe(cb: () => void) {
  const a = window.matchMedia(QUERIES.desktop);
  const b = window.matchMedia(QUERIES.tablet);
  a.addEventListener("change", cb);
  b.addEventListener("change", cb);
  return () => {
    a.removeEventListener("change", cb);
    b.removeEventListener("change", cb);
  };
}

function read(): TerminalLayout {
  if (window.matchMedia(QUERIES.desktop).matches) return "desktop";
  if (window.matchMedia(QUERIES.tablet).matches) return "tablet";
  return "mobile";
}

export function useTerminalLayout(): TerminalLayout {
  return useSyncExternalStore(subscribe, read, () => "desktop");
}
