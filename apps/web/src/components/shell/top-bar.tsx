"use client";
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useFunds } from "@/lib/funds/queries";
import { cn } from "@/lib/cn";
import { setUi } from "@/lib/ui-store";
import { Kbd } from "../ui/kbd";
import { NAV as NAV_TYPES, SwapText } from "../ui/transitions";
import { AccountMenu } from "./account-menu";
import { LiveIndicator } from "./live-indicator";
import { LogoMark } from "./logo";
import { titleFor } from "./nav";

export function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={cn(

        "sticky top-0 z-40 flex h-14 items-center gap-3 bg-canvas px-4 transition-[background-color,box-shadow] duration-200 [view-transition-name:app-topbar] md:pointer-events-none md:h-16 md:px-6 lg:px-8",
        scrolled ? "shadow-[0_1px_0_var(--line)]" : "md:bg-transparent",
      )}
    >
      <Link
        href="/app"
        transitionTypes={NAV_TYPES.lateral}
        className="-ml-2 flex size-11 items-center justify-center rounded-control md:hidden"
        aria-label="Drixie — Funds"
      >
        <LogoMark size={28} />
      </Link>
      <Suspense fallback={<div className="min-w-0 flex-1" />}>
        <Breadcrumb />
      </Suspense>
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setUi({ paletteOpen: true })}
          className={cn(
            "flex h-11 items-center gap-2 rounded-full bg-paper text-body-sm text-ink-3 shadow-[0_0_0_1px_var(--line-strong)] transition-shadow hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--ink)_28%,transparent)]",
            "w-11 justify-center md:w-44 md:justify-start md:pl-3 md:pr-2 lg:w-72",
          )}
          aria-label="Search funds, stocks and pages"
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search className="size-4 shrink-0 text-ink-2" aria-hidden />
          <span className="hidden min-w-0 flex-1 truncate whitespace-nowrap text-left md:inline lg:hidden">Search…</span>
          <span className="hidden min-w-0 flex-1 truncate whitespace-nowrap text-left lg:inline">Search funds, stocks and pages</span>
          <span className="hidden items-center gap-1 md:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <LiveIndicator />
        <AccountMenu />
      </div>
    </header>
  );
}

function Breadcrumb() {
  const pathname = usePathname();
  const t = titleFor(pathname);
  const funds = useFunds();
  if (!t.parent) return <div className="min-w-0 flex-1" />;

  const fundId = pathname.startsWith("/app/f/") ? decodeURIComponent(pathname.split("/")[3] ?? "").toLowerCase() : null;
  const name = fundId ? funds.data?.items.find((f) => f.id === fundId)?.name : null;
  return (
    <div className="flex min-w-0 flex-1 items-center">
    <nav aria-label="Breadcrumb" className="pointer-events-auto hidden min-w-0 items-center gap-1 text-body-sm md:flex">
      <Link
        href={t.parent.href}
        transitionTypes={NAV_TYPES.back}
        className="-mx-1.5 inline-flex h-11 shrink-0 items-center rounded-control px-1.5 text-ink-2 transition-colors hover:text-ink"
      >
        {t.parent.label}
      </Link>
      <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0 font-medium text-ink" aria-current="page">
        <SwapText value={name ?? t.title} className="grid min-w-0 [&>*]:min-w-0 [&>*]:truncate" />
      </span>
    </nav>
    </div>
  );
}
