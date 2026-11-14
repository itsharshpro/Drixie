"use client";

import { cn } from "@/lib/cn";
import { bps } from "@/lib/funds/format";
import { fundName } from "@/lib/funds/meta";
import { Tooltip } from "../ui/tooltip";
import { FundMark } from "../funds/fund-mark";

export interface HeldEntry {
  fund: string;
  bps: number;
}

export function sortHeld(rows: readonly HeldEntry[]): HeldEntry[] {
  return [...rows].sort((a, b) => b.bps - a.bps);
}

export function HeldByStack({ rows, max = 5, names = 2, size = 24, className }: { rows: readonly HeldEntry[]; max?: number; names?: number; size?: 24 | 32; className?: string }) {
  const held = sortHeld(rows);
  if (!held.length) {
    return <span className={cn("inline-flex h-6 items-center text-caption text-ink-3", className)}>No fund holds it yet</span>;
  }
  const shown = held.slice(0, max);
  const top = held.slice(0, names);
  const rest = held.length - top.length;
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="flex shrink-0 items-center" aria-hidden>
        {shown.map((h, i) => (
          <Tooltip key={h.fund} content={`${fundName(h.fund)} holds ${bps(h.bps)}`}>
            <span
              className="relative inline-flex rounded-[7px] ring-2 ring-paper transition-transform duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:z-10 hover:-translate-y-0.5"
              style={{ marginLeft: i ? -6 : 0, zIndex: shown.length - i }}
            >
              <FundMark fund={h.fund} size={size} />
            </span>
          </Tooltip>
        ))}
      </span>
      <span className="min-w-0 truncate text-caption text-ink-2">
        {top.map((h, i) => (
          <span key={h.fund}>
            {i > 0 && <span className="text-ink-3"> · </span>}
            <span className="font-medium text-ink">{fundName(h.fund)}</span>{" "}
            <span className="num">{bps(h.bps, 0)}</span>
          </span>
        ))}
        {rest > 0 && <span className="num text-ink-3"> +{rest}</span>}
      </span>
      <span className="sr-only">
        Held by {held.map((h) => `${fundName(h.fund)} at ${bps(h.bps)}`).join(", ")}
      </span>
    </span>
  );
}
