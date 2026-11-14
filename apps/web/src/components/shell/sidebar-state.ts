"use client";

import { animate } from "motion";
import { useCallback, useSyncExternalStore } from "react";

import { SIDEBAR_KEY } from "./sidebar-script";

const EXPANDED = 248;
const RAIL = 72;

function read(): boolean {
  return document.documentElement.getAttribute("data-sb") === "collapsed";
}

function subscribe(fn: () => void): () => void {
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sb"] });
  return () => mo.disconnect();
}

let busy = false;

function persist(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {

  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function toggleSidebar(): Promise<void> {
  if (busy) return;
  const el = document.querySelector<HTMLElement>(".app-sidebar");
  const html = document.documentElement;
  const collapsing = !read();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = window.matchMedia("(min-width: 1024px)").matches;

  if (!el || reduce || !desktop) {
    if (collapsing) html.setAttribute("data-sb", "collapsed");
    else html.removeAttribute("data-sb");
    persist(collapsing);
    return;
  }

  busy = true;
  const spring = { type: "spring" as const, stiffness: 420, damping: 36 };
  try {
    if (collapsing) {
      html.setAttribute("data-sb-labels", "hidden");
      await wait(120);
      await animate(el, { width: [`${EXPANDED}px`, `${RAIL}px`] }, spring);
      html.setAttribute("data-sb", "collapsed");
    } else {
      html.setAttribute("data-sb-labels", "hidden");
      el.style.width = `${RAIL}px`;
      html.removeAttribute("data-sb");
      const anim = animate(el, { width: [`${RAIL}px`, `${EXPANDED}px`] }, spring);
      await wait(80);
      html.removeAttribute("data-sb-labels");
      await anim;
    }
  } finally {
    el.style.width = "";
    html.removeAttribute("data-sb-labels");
    persist(collapsing);
    busy = false;
  }
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => void toggleSidebar(), []);
  return [collapsed, toggle];
}
