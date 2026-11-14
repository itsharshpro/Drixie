"use client";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CircleHelp, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { useHotkey } from "@/lib/hooks/use-hotkey";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { EASE, SPRING } from "@/lib/motion";
import { setUi, useUi } from "@/lib/ui-store";
import { Kbd } from "../ui/kbd";
import { NAV as NAV_TYPES } from "../ui/transitions";
import { Tooltip } from "../ui/tooltip";
import { LogoMark, Wordmark } from "./logo";
import { NAV, navFor, type NavItem } from "./nav";
import { NetworkBadge } from "./network-badge";
import { useSidebarCollapsed } from "./sidebar-state";

export function Sidebar() {
  const [collapsed, toggle] = useSidebarCollapsed();
  const overlay = useUi((s) => s.overlayOpen);
  const desktop = useIsDesktop();
  const rail = desktop ? collapsed : !overlay;

  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(overlay);
  if (wasOpen !== overlay) {
    setWasOpen(overlay);
    setClosing(!overlay && !desktop);
  }
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => setClosing(false), 200);
    return () => clearTimeout(t);
  }, [closing]);
  const overlayState = desktop ? undefined : overlay ? "open" : closing ? "closing" : undefined;

  const onToggle = () => {
    if (desktop) toggle();
    else setUi({ overlayOpen: !overlay });
  };

  useHotkey(["[", "mod+b"], onToggle);
  useHotkey("escape", () => setUi({ overlayOpen: false }), overlay);

  return (
    <>
      <div className="app-sidebar relative hidden shrink-0 border-r border-line bg-paper md:block" data-overlay={overlayState}>
        <aside
          aria-label="Main"
          className="sticky top-0 flex h-dvh w-full flex-col overflow-hidden bg-paper [view-transition-name:app-sidebar]"
        >
          <div className="flex h-16 shrink-0 items-center gap-3 pl-5 pr-3">
            <Link href="/app" transitionTypes={NAV_TYPES.lateral} className="-mx-1.5 flex h-11 min-w-11 items-center gap-3 rounded-control px-1.5" aria-label="Drixie — Funds">
              <LogoMark size={32} />
              <Wordmark className="sb-label" />
            </Link>
          </div>

          <Suspense fallback={<NavList items={NAV} active={null} rail={rail} />}>
            <ActiveNav rail={rail} />
          </Suspense>

          <div className="mt-auto px-3 pb-2">
            <Tooltip content="How Drixie works" side="right">
              <Link
                href="/app/guide"
                transitionTypes={NAV_TYPES.lateral}
                className="flex h-11 items-center gap-3 rounded-control px-3 text-body-sm text-ink-2 transition-colors duration-150 hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
              >
                <CircleHelp className="size-5 shrink-0" aria-hidden />
                <span className="sb-label">How Drixie works</span>
              </Link>
            </Tooltip>
          </div>
          <div className="border-t border-line">
            <div className="sb-expanded-only flex h-16 items-center justify-between gap-2 pl-5 pr-3">
              <NetworkBadge />
              <Tooltip content={<span className="flex items-center gap-2">Collapse <Kbd>[</Kbd></span>} side="top">
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Collapse sidebar"
                  aria-expanded
                  className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-3 transition-colors duration-150 hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                >
                  <PanelLeftClose className="size-5" aria-hidden />
                </button>
              </Tooltip>
            </div>
            <div className="sb-collapsed-only flex flex-col items-center gap-1 py-3">
              <NetworkBadge rail />
              <Tooltip content={<span className="flex items-center gap-2">Expand <Kbd>[</Kbd></span>} side="right">
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Expand sidebar"
                  aria-expanded={false}
                  className="flex size-11 items-center justify-center rounded-control text-ink-3 transition-colors duration-150 hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                >
                  <PanelLeftOpen className="size-5" aria-hidden />
                </button>
              </Tooltip>
            </div>
          </div>
        </aside>
      </div>
      <AnimatePresence>
        {overlay && !desktop && (
          <motion.div
            key="sb-scrim"
            className="fixed inset-0 z-[55] hidden bg-ink/16 md:block lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE } }}
            onClick={() => setUi({ overlayOpen: false })}
            aria-hidden
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ActiveNav({ rail }: { rail: boolean }) {
  const pathname = usePathname();
  const prev = useRef(pathname);
  useEffect(() => {
    if (prev.current !== pathname) {
      prev.current = pathname;
      setUi({ overlayOpen: false });
    }
  }, [pathname]);
  const active = navFor(pathname)?.href ?? null;
  return <NavList items={NAV} active={active} rail={rail} />;
}

function NavList({ items, active, rail }: { items: NavItem[]; active: string | null; rail: boolean }) {
  const listRef = useRef<HTMLUListElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-nav]") ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    e.preventDefault();
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : e.key === "ArrowDown" ? (i + 1) % links.length : (i - 1 + links.length) % links.length;
    links[next]?.focus();
  };

  return (
    <nav className="px-3 pt-2" aria-label="Pages">
      <LayoutGroup id="sidebar-nav">
        <ul ref={listRef} className="flex flex-col gap-1" onKeyDown={onKeyDown}>
          {items.map((item) => {
            const isActive = item.href === active;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Tooltip content={item.label} side="right" disabled={!rail}>
                  <Link
                    href={item.href}
                    transitionTypes={NAV_TYPES.lateral}
                    data-nav
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex h-11 items-center gap-3 rounded-control pl-3 pr-3 text-body-sm font-medium outline-none transition-colors duration-[120ms]",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
                      isActive ? "text-brand" : "text-ink-2 hover:bg-fill hover:text-ink",
                    )}
                  >
                    {isActive && (
                      <motion.span layoutId="sidebar-pill" transition={SPRING} className="absolute inset-0 rounded-control bg-brand-soft" />
                    )}
                    <span className="relative flex size-6 shrink-0 items-center justify-center">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="sb-label relative">{item.label}</span>
                  </Link>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
    </nav>
  );
}
