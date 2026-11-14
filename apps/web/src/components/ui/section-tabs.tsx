"use client";

import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useEdgeFade } from "@/lib/hooks/use-edge-fade";
import { SPRING } from "@/lib/motion";
import { sectionFor, SECTIONS, type SectionKey, type SectionTab } from "../shell/nav";
import { NAV } from "./transitions";

export function SectionTabs({ section, className }: { section?: SectionKey; className?: string }) {
  const pathname = usePathname() ?? "";
  const found = sectionFor(pathname);
  const key = section ?? found?.key;
  const ref = useEdgeFade<HTMLDivElement>();
  if (!key) return null;
  const tabs: SectionTab[] = (SECTIONS as Record<string, SectionTab[]>)[key] ?? [];
  if (!tabs.length) return null;
  const active = tabs.find((t) => t.match(pathname))?.href ?? null;
  return (
    <nav aria-label="Section" data-section-tabs className={cn("relative", className)}>
      <div ref={ref} className="hscroll hscroll-flush border-b border-line">
        <LayoutGroup id={`section-${key}`}>
          <ul className="flex w-max min-w-full gap-6">
            {tabs.map((t) => {
              const isActive = t.href === active;
              return (
                <li key={t.href} className="flex">
                  <Link
                    href={t.href}
                    transitionTypes={NAV.lateral}
                    aria-current={isActive ? "page" : undefined}
                    data-state={isActive ? "active" : undefined}
                    className={cn(
                      "relative flex h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap text-body-sm font-medium outline-none transition-colors duration-[120ms]",
                      "focus-visible:rounded-chip focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
                      isActive ? "text-ink" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {t.label}
                    {isActive && (
                      <motion.span
                        layoutId={`section-underline-${key}`}
                        transition={SPRING}
                        className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </LayoutGroup>
      </div>
    </nav>
  );
}
