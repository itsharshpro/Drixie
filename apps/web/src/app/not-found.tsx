import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { LINE_ICONS } from "@/components/ui/line-icons";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Link href="/" aria-label="Drixie home" className="flex size-11 items-center justify-center rounded-control">
        <LogoMark size={32} />
      </Link>
      <div className="flex size-16 items-center justify-center">{LINE_ICONS.search}</div>
      <div className="flex max-w-80 flex-col gap-1">
        <h1 className="text-title font-semibold tracking-[-0.015em]">We couldn&apos;t find that page</h1>
        <p className="text-body-sm text-ink-2">The link may be old. The market is one click away.</p>
      </div>
      <Button asChild size="lg">
        <Link href="/app">Open the market</Link>
      </Button>
    </main>
  );
}
