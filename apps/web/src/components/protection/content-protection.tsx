"use client";

import { useEffect, useState } from "react";
import "./protection.css";

const ENABLED = process.env.NEXT_PUBLIC_PROTECT !== "0";

const allowed = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable='true'], [data-selectable]");

function blockedKey(e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (k === "f12") return true;
  if (mod && e.shiftKey && ["i", "j", "c", "k"].includes(k)) return true;
  if (mod && e.altKey && ["i", "j", "c", "u"].includes(k)) return true; // macOS Cmd+Opt+I/J/C/U
  if (mod && !e.shiftKey && ["u", "s", "p"].includes(k)) return true;
  return false;
}

export function ContentProtection() {
  const [cover, setCover] = useState<null | "devtools" | "capture">(null);

  useEffect(() => {
    if (!ENABLED) return;
    document.documentElement.dataset.protect = "on";
    const onContext = (e: MouseEvent) => {
      if (!allowed(e.target)) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (blockedKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        void navigator.clipboard?.writeText("").catch(() => {});
        setCover("capture");
        window.setTimeout(() => setCover((c) => (c === "capture" ? null : c)), 1200);
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!allowed(e.target) && !window.getSelection()?.anchorNode?.parentElement?.closest("[data-selectable]")) e.preventDefault();
    };
    const onDrag = (e: DragEvent) => {
      if (e.target instanceof HTMLImageElement || e.target instanceof SVGElement) e.preventDefault();
    };
    document.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("dragstart", onDrag);

    const trap = Function("debugger") as () => void;
    const timer = window.setInterval(() => {
      const t0 = performance.now();
      trap();
      const paused = performance.now() - t0 > 120;
      setCover((c) => (paused ? "devtools" : c === "devtools" ? null : c));
    }, 1500);

    return () => {
      delete document.documentElement.dataset.protect;
      document.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("dragstart", onDrag);
      window.clearInterval(timer);
    };
  }, []);

  if (!ENABLED || !cover) return null;
  return (
    <div className="protect-cover" role="alertdialog" aria-live="assertive">
      <div className="protect-card">
        <p className="protect-title">{cover === "devtools" ? "Close developer tools to continue" : "Screenshots are turned off"}</p>
        <p className="protect-body">
          {cover === "devtools" ? "Drixie hides its interface while developer tools are open." : "This view is protected."}
        </p>
      </div>
    </div>
  );
}
