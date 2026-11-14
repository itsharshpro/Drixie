"use client";
import { useFundStreamStatus } from "@/lib/funds/stream";
import { LiveDot } from "../ui/live-dot";
import { SwapText } from "../ui/transitions";
import { Tooltip } from "../ui/tooltip";

const COPY = {
  live: { label: "Live", tip: "NAVs, rebalance moves and coin trades update as they happen." },
  connecting: { label: "Syncing", tip: "Connecting to live updates…" },
  offline: { label: "Offline", tip: "Live updates paused. We'll reconnect automatically." },
} as const;

const LABELS = Object.values(COPY).map((c) => c.label);

export function LiveIndicator() {
  const status = useFundStreamStatus();
  const c = COPY[status];
  return (
    <Tooltip content={c.tip} side="bottom">
      <span
        className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-caption font-medium text-ink-2 shadow-[0_0_0_1px_var(--line)] md:px-4"
        role="status"
        aria-live="polite"
      >
        <span className="md:hidden">
          <LiveDot tone={status} />
        </span>
        <span className="hidden md:inline-grid md:justify-items-center">
          {LABELS.map((l) => (
            <span key={l} aria-hidden className="invisible col-start-1 row-start-1 flex items-center gap-2">
              <span className="size-2" />
              {l}
            </span>
          ))}
          <span className="col-start-1 row-start-1 flex items-center gap-2">
            <LiveDot tone={status} />
            <SwapText value={c.label} />
          </span>
        </span>
        <span className="sr-only md:hidden">{c.label}</span>
      </span>
    </Tooltip>
  );
}
