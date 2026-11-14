"use client";
import { LayoutGroup, motion } from "motion/react";
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion";
import { setUi, useUi } from "@/lib/ui-store";
import { Sheet } from "../ui/sheet";
import { NAV as NAV_TYPES } from "../ui/transitions";
import { navFor, PHONE_MORE, PHONE_TABS } from "./nav";

const PRIMARY = PHONE_TABS; // Funds, Portfolio, Stocks
const MORE = PHONE_MORE; // Compete, Economy, Gallery

export function BottomTabs() {
  return (
    <Suspense fallback={<Tabs active={null} />}>
      <ActiveTabs />
    </Suspense>
  );
}

function ActiveTabs() {
  const pathname = usePathname();
  const active = navFor(pathname)?.href ?? null;
  return <Tabs active={active} />;
}

function Tabs({ active }: { active: string | null }) {
  const moreOpen = useUi((s) => s.moreOpen);
  const moreActive = MORE.some((m) => m.href === active);
  return (
    <>
      <nav
        aria-label="Pages"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] [view-transition-name:app-tabbar] md:hidden"
      >
        <LayoutGroup id="bottom-tabs">
          <ul className="grid h-16 grid-cols-4 px-2">
            {PRIMARY.map((item) => {
              const isActive = item.href === active;
              const Icon = item.icon;
              return (
                <li key={item.href} className="flex">
                  <Link
                    href={item.href}
                    transitionTypes={NAV_TYPES.lateral}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex flex-1 flex-col items-center justify-center gap-1 text-caption font-medium leading-none transition-colors",
                      isActive ? "text-brand" : "text-ink-2",
                    )}
                  >
                    {isActive && (
                      <motion.span layoutId="tab-pill" transition={SPRING} className="absolute top-2 h-8 w-14 rounded-full bg-brand-soft" />
                    )}
                    <Icon className="relative size-5" aria-hidden />
                    <span className="relative">{item.label}</span>
                  </Link>
                </li>
              );
            })}
            <li className="flex">
              <button
                type="button"
                onClick={() => setUi({ moreOpen: true })}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 text-caption font-medium leading-none",
                  moreActive ? "text-brand" : "text-ink-2",
                )}
                aria-haspopup="dialog"
              >
                {moreActive && <motion.span layoutId="tab-pill" transition={SPRING} className="absolute top-2 h-8 w-14 rounded-full bg-brand-soft" />}
                <Ellipsis className="relative size-5" aria-hidden />
                <span className="relative">More</span>
              </button>
            </li>
          </ul>
        </LayoutGroup>
      </nav>
      <Sheet open={moreOpen} onOpenChange={(o) => setUi({ moreOpen: o })} title="More">
        <ul className="flex flex-col gap-1">
          {MORE.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === active;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  transitionTypes={NAV_TYPES.lateral}
                  onClick={() => setUi({ moreOpen: false })}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 items-center gap-4 rounded-control px-3 py-3 transition-colors",
                    isActive ? "bg-brand-soft" : "hover:bg-fill",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-control",
                      isActive ? "bg-paper text-brand" : "bg-fill text-ink-2",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className={cn("text-body font-medium", isActive ? "text-brand" : "text-ink")}>{item.label}</span>
                    <span className="text-body-sm text-ink-2">{item.blurb}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
