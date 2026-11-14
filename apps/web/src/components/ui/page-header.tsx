"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { navFor, titleFor } from "../shell/nav";
import { SectionTabs } from "./section-tabs";
import { NAV } from "./transitions";

export interface PageHeaderProps {
  title: ReactNode;

  subtitle?: ReactNode;

  eyebrow?: ReactNode;

  leading?: ReactNode;

  meta?: ReactNode;

  actions?: ReactNode;

  back?: boolean;

  tabs?: boolean;

  className?: string;
}

export function PageHeader({ title, subtitle, eyebrow, leading, meta, actions, back = true, tabs = true, className }: PageHeaderProps) {
  const pathname = usePathname();
  const route = pathname ? titleFor(pathname) : undefined;
  const parent = back ? route?.parent : undefined;

  const inBar = !!route && !route.parent;

  const line = (inBar && pathname ? navFor(pathname)?.headline : undefined) ?? subtitle;
  const headerActions = inBar ? undefined : actions;
  return (
    <>
    <header className={cn("pb-6", inBar && "md:-mt-[72px]")}>
      <div
        className={cn(
          "flex min-h-[72px] flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6",
          inBar && "md:min-h-0 md:flex-col md:items-start md:justify-start md:gap-4",
          className,
        )}
      >
      <div className={cn("flex min-w-0 flex-col gap-2", inBar && "md:min-h-16 md:w-full md:justify-center md:pr-[360px] lg:pr-[480px]")}>
        {parent && (
          <Link
            href={parent.href}
            transitionTypes={NAV.back}
            className="-ml-2 inline-flex h-11 w-fit items-center gap-1.5 rounded-control px-2 text-label font-medium text-ink-2 transition-colors duration-150 hover:text-ink md:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {parent.label}
          </Link>
        )}
        <div className="flex min-w-0 items-center gap-4">
          {leading && <div className="shrink-0">{leading}</div>}
          <div className="min-w-0">
            {eyebrow && <div className="mb-1 truncate text-caption font-medium text-ink-3">{eyebrow}</div>}
            <h1 className="text-title font-semibold tracking-[-0.015em] text-ink">{title}</h1>
            {line && <p className={cn("mt-1 text-body-sm text-ink-2", inBar && "truncate")}>{line}</p>}
            {meta && <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>
      </div>
      {headerActions && <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div>}
      </div>
      {tabs && <SectionTabs className="mt-6" />}
    </header>
    {inBar && actions && <div className="-mt-2 mb-6 flex flex-wrap items-center gap-2">{actions}</div>}
    </>
  );
}
