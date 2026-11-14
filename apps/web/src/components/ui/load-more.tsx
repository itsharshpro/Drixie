"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export function LoadMore({
  onClick,
  loading = false,
  hasMore = true,
  label = "Show older",
  className,
}: {
  onClick: () => void;
  loading?: boolean;

  hasMore?: boolean;
  label?: string;
  className?: string;
}) {
  if (!hasMore) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      className={cn(
        "flex h-11 w-full select-none items-center justify-center gap-2 rounded-control text-body-sm font-medium text-ink-2",
        "transition-[background-color,color,transform] duration-150 hover:bg-fill hover:text-ink active:scale-[0.98] active:duration-[120ms]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none",
        className,
      )}
    >
      {loading ? <Spinner className="size-4" label="Loading" /> : <ChevronDown className="size-4" strokeWidth={1.5} aria-hidden />}
      {loading ? "Loading…" : label}
    </button>
  );
}
