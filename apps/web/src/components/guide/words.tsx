"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { GLOSSARY, isGlossaryId, type GlossaryId } from "@/lib/glossary";
import { Card } from "../ui/card";
import { Term } from "../ui/term";

const WORDS: { id: GlossaryId; label: string }[] = [
  { id: "nav", label: "NAV" },
  { id: "fund-coin", label: "Coin" },
  { id: "premium", label: "Premium" },
  { id: "rebalance-bell", label: "Rebalance bell" },
  { id: "reputation", label: "Reputation" },
  { id: "promise-bond", label: "Promise bond" },
  { id: "seat", label: "Manager seat" },
  { id: "basket-card", label: "Basket card" },
];

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

function useHash(): string | null {
  const raw = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
  return raw ? decodeURIComponent(raw.slice(1)) : null;
}

export function useAllWords() {
  const hash = useHash();
  const target = hash && (isGlossaryId(hash) || hash === "glossary") ? hash : null;
  const [manual, setManual] = useState<boolean | null>(null);

  const [lastTarget, setLastTarget] = useState(target);
  if (lastTarget !== target) {
    setLastTarget(target);
    if (target) setManual(null);
  }
  const open = manual ?? !!target;
  useEffect(() => {
    if (!target) return;
    const id = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return { open, toggle: () => setManual(!open), hash };
}

export function Words({ open, onToggle, className }: { open: boolean; onToggle: () => void; className?: string }) {
  return (
    <Card as="section" aria-labelledby="guide-words-h" className={cn("flex flex-col p-4 md:p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="guide-words-h" className="text-body font-semibold tracking-[-0.01em] text-ink">
          Words
        </h2>
        <span className="text-caption text-ink-3">Tap one</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {WORDS.map((w) => (
          <li key={w.id}>
            <Term
              id={w.id}
              className="inline-flex min-h-10 items-center rounded-full bg-canvas px-3.5 text-body-sm pointer-coarse:min-h-11 font-medium text-ink no-underline ring-1 ring-line transition-[background-color,box-shadow,transform] duration-150 hover:bg-brand-soft hover:ring-brand/30 active:scale-[0.98] data-[state=open]:bg-brand-soft data-[state=open]:text-brand data-[state=open]:ring-brand/30"
            >
              {w.label}
            </Term>
          </li>
        ))}
      </ul>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="glossary"
        onClick={onToggle}
        className="-mx-1 mt-auto inline-flex min-h-11 w-fit items-center gap-1 rounded-control px-1 pt-2 text-label font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
      >
        {open ? "Hide all words" : `All ${GLOSSARY.length} words`}
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
    </Card>
  );
}

export function AllWords({ open, hash, className }: { open: boolean; hash: string | null; className?: string }) {
  return (
    <Card as="section" id="glossary" aria-label="All words" hidden={!open} className={cn("scroll-mt-24 p-2 md:p-3", className)}>
      <dl className="grid grid-cols-1 gap-x-4 md:grid-cols-2 lg:grid-cols-3">
        {GLOSSARY.map((e) => (
          <div
            key={e.id}
            id={e.id}
            className={cn("scroll-mt-24 rounded-control px-3 py-2.5 transition-colors duration-300", hash === e.id && "bg-brand-soft/60")}
          >
            <dt className="text-body-sm font-semibold text-ink">{e.term}</dt>
            <dd className="text-body-sm text-ink-2">{e.short}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
