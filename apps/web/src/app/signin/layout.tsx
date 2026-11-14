import Link from "next/link";
import { ViewTransition } from "react";
import { Grain } from "@/components/marketing/v4/primitives/grain";
import { DrixieLogo } from "@/components/ui/brand";
import { QueryBoundary } from "@/lib/query/provider";

const SWAP = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "none",
};

export default function SigninLayout({ children }: LayoutProps<"/signin">) {
  return (
    <QueryBoundary>
      <ViewTransition enter={SWAP} exit={SWAP} default="none">
        <div className="relative isolate flex min-h-dvh flex-col">
          <div
            data-art
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden"
            style={{ maskImage: "linear-gradient(to bottom, #000 45%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent)" }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 70% at 18% 0%, color-mix(in oklab, var(--sky) 85%, transparent), transparent 70%), radial-gradient(48% 60% at 86% 8%, color-mix(in oklab, var(--lavender) 55%, transparent), transparent 72%), radial-gradient(40% 40% at 52% 0%, color-mix(in oklab, var(--brand) 14%, transparent), transparent 75%)",
              }}
            />
            <Grain opacity={0.06} />
          </div>
          <header className="flex h-16 items-center px-4 md:px-8">
            <Link
              href="/"
              className="flex min-h-11 items-center gap-3 rounded-control"
              aria-label="Drixie home"
            >
              <DrixieLogo size={28} decorative />
            </Link>
          </header>
          <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 md:items-center md:pt-0">
            {children}
          </main>
          <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 pb-8 text-caption text-ink-3">
            <span>Drixie pays the network fees.</span>
            <Link
              href="/app"
              className="inline-flex min-h-11 items-center font-medium text-ink-2 hover:text-ink"
            >
              Browse the market first
            </Link>
          </footer>
        </div>
      </ViewTransition>
    </QueryBoundary>
  );
}
