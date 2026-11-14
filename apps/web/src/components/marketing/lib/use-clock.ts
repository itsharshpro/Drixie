"use client";

import { useSyncExternalStore } from "react";

let now = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();

function tick() {
  now = Date.now();
  for (const fn of subs) fn();
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (!subs.size || document.visibilityState === "hidden") return;
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

function onVisibility() {
  if (document.visibilityState === "visible") tick();
  else clearTimeout(timer);
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  if (subs.size === 1) {
    now = Date.now();
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
  }
  return () => {
    subs.delete(fn);
    if (!subs.size) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

export function useClock(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now || null,
    () => null,
  );
}
