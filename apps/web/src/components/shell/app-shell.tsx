"use client";
import { ViewTransition, type ReactNode } from "react";
import { QueryBoundary } from "@/lib/query/provider";
import { FundStreamProvider } from "@/lib/funds/stream";
import { BottomTabs } from "./bottom-tabs";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

const SHELL_ENTER = { "nav-forward": "nav-forward", default: "none" };

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <QueryBoundary>
    <FundStreamProvider>
      <ViewTransition enter={SHELL_ENTER} default="none">
      <a
        href="#main"
        className="sr-only z-[100] rounded-control bg-ink px-4 text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:inline-flex focus:h-11 focus:items-center"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" className="mx-auto w-full min-w-0 max-w-[1384px] flex-1 px-4 pb-32 pt-4 md:px-6 md:pb-16 md:pt-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
      <BottomTabs />
      </ViewTransition>
      <CommandPalette />
    </FundStreamProvider>
    </QueryBoundary>
  );
}
