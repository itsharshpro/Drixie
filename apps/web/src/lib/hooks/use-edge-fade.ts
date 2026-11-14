"use client";

import { useCallback, useRef } from "react";

export function edgeState(scrollLeft: number, scrollWidth: number, clientWidth: number): { left: boolean; right: boolean } {
  const max = scrollWidth - clientWidth;
  if (max <= 1) return { left: false, right: false };
  return { left: scrollLeft > 1, right: scrollLeft < max - 1 };
}

export function useEdgeFade<T extends HTMLElement = HTMLDivElement>(): (el: T | null) => void {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const update = () => {
      const s = edgeState(el.scrollLeft, el.scrollWidth, el.clientWidth);
      el.toggleAttribute("data-fade-l", s.left);
      el.toggleAttribute("data-fade-r", s.right);
    };

    const active = el.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"], [data-state="active"], [aria-pressed="true"]');
    if (active && el.scrollWidth > el.clientWidth) {
      const a = active.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      if (a.right > b.right - 24) el.scrollLeft += a.right - b.right + 32;
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of Array.from(el.children)) ro.observe(child);
      update();
    });
    mo.observe(el, { childList: true });
    cleanup.current = () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
}
