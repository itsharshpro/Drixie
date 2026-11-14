"use client";
import { useEffect, useRef } from "react";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useHotkey(combo: string | string[], handler: (e: KeyboardEvent) => void, enabled = true): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const combos = (Array.isArray(combo) ? combo : [combo]).join("|");
  useEffect(() => {
    if (!enabled) return;
    const list = combos.split("|").map((c) => {
      const parts = c.toLowerCase().split("+");
      return { mod: parts.includes("mod"), shift: parts.includes("shift"), key: parts[parts.length - 1] };
    });
    const onKey = (e: KeyboardEvent) => {
      for (const c of list) {
        const mod = e.metaKey || e.ctrlKey;
        if (c.mod !== mod) continue;
        if (c.shift !== e.shiftKey && c.key.length > 1) continue;
        if (e.key.toLowerCase() !== c.key) continue;
        if (!c.mod && isTyping(e.target)) continue;
        e.preventDefault();
        ref.current(e);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combos, enabled]);
}
