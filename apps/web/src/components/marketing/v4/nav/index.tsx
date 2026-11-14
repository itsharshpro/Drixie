"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DrixieLogo } from "@/components/ui/brand";
import { useMe } from "@/lib/api/queries";
import { MagneticButton, useReducedMotionSafe } from "../primitives";

const LINKS = [
  { href: "#arena", id: "arena", label: "Arena" },
  { href: "#managers", id: "managers", label: "Managers" },
  { href: "#bell", id: "bell", label: "The bell" },
  { href: "#baskets", id: "baskets", label: "Baskets" },
  { href: "#faq", id: "faq", label: "FAQ" },
] as const;

const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const;

export function Nav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotionSafe();
  const menuBtn = useRef<HTMLButtonElement>(null);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  useEffect(() => {
    const els = LINKS.map((l) => document.getElementById(l.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = LINKS.find((l) => seen.get(l.id));
        setActive(first ? first.id : null);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const pill = hover ?? active;

  const signedIn = !!useMe().data;
  const second = signedIn ? { href: "/app/portfolio", label: "Portfolio" } : { href: "/signin", label: "Sign in" };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-3 md:top-4 md:px-6">
      <motion.nav
        aria-label="Main"
        className="pointer-events-auto relative w-full rounded-[28px] bg-paper"
        initial={false}
        animate={{
          maxWidth: scrolled ? 860 : 920,
          boxShadow: scrolled
            ? "0 0 0 1px rgba(15,17,23,0.08), 0 18px 40px -18px rgba(15,17,23,0.28)"
            : "0 0 0 1px rgba(15,17,23,0.07), 0 6px 20px -12px rgba(15,17,23,0.16)",
        }}
        transition={reduced ? { duration: 0 } : SPRING}
      >
        <div className="flex h-14 items-center justify-between gap-2 pl-4 pr-2">
          <Link href="/" aria-label="Drixie home" className="flex h-11 shrink-0 items-center rounded-full pr-2 focus-visible:outline-2 focus-visible:outline-brand">
            <DrixieLogo size={26} decorative />
          </Link>

          <ul className="hidden items-center md:flex" onPointerLeave={() => setHover(null)}>
            {LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={l.href}
                  onPointerEnter={() => setHover(l.id)}
                  onFocus={() => setHover(l.id)}
                  onBlur={() => setHover(null)}
                  aria-current={active === l.id ? "true" : undefined}
                  className="relative flex h-11 items-center whitespace-nowrap px-3 text-[14px] font-medium tracking-[-0.01em] text-ink-2 transition-colors duration-200 hover:text-ink aria-[current=true]:text-ink lg:px-4"
                >
                  {pill === l.id ? (
                    <motion.span
                      layoutId="v4-nav-pill"
                      className="absolute inset-x-0.5 inset-y-1.5 rounded-full bg-[color-mix(in_oklab,var(--ink)_5%,transparent)]"
                      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
                    />
                  ) : null}
                  <span className="relative">{l.label}</span>
                </a>
              </li>
            ))}
          </ul>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              href={second.href}
              className="hidden h-11 items-center rounded-full px-3.5 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink lg:flex"
            >
              {second.label}
            </Link>
            <MagneticButton href="/app" variant="ink" size="sm" shape="pill" strength={5} className="hidden md:inline-flex">
              See the funds
            </MagneticButton>
            <button
              ref={menuBtn}
              type="button"
              className="grid size-11 place-items-center rounded-full text-ink transition-colors hover:bg-fill md:hidden"
              aria-expanded={open}
              aria-controls="v4-nav-sheet"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="relative block h-3 w-[18px]" aria-hidden>
                <span
                  className={`absolute left-0 top-0 h-[1.6px] w-full rounded-full bg-current transition-transform duration-200 ${open ? "translate-y-[5.2px] rotate-45" : ""}`}
                />
                <span
                  className={`absolute bottom-0 left-0 h-[1.6px] w-full rounded-full bg-current transition-transform duration-200 ${open ? "-translate-y-[5.2px] -rotate-45" : ""}`}
                />
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id="v4-nav-sheet"
              key="sheet"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 40 }}
              className="overflow-hidden md:hidden"
            >
              <ul className="flex flex-col px-2 pb-2">
                {LINKS.map((l, i) => (
                  <motion.li
                    key={l.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i + 0.05, duration: 0.3 }}
                  >
                    <a
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="flex h-12 items-center justify-between rounded-[14px] px-3 text-[16px] font-medium text-ink hover:bg-fill"
                    >
                      {l.label}
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="text-ink-3">
                        <path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </motion.li>
                ))}
                <li className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-3">
                  <Link
                    href={second.href}
                    className="flex h-12 items-center justify-center rounded-[12px] text-[15px] font-medium text-ink shadow-[0_0_0_1px_var(--line-strong)]"
                  >
                    {second.label}
                  </Link>
                  <Link href="/app" className="flex h-12 items-center justify-center rounded-[12px] bg-ink text-[15px] font-medium text-paper">
                    See the funds
                  </Link>
                </li>
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.nav>
    </div>
  );
}
