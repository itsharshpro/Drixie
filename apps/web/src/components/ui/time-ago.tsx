"use client";

import { cn } from "@/lib/cn";
import { formatAgo, formatDateTime } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";

export function TimeAgo({
  at,
  now: nowProp,
  fixed = true,
  className,
}: {
  at: string | number | Date;

  now?: number | null;

  fixed?: boolean;
  className?: string;
}) {
  const own = useNow(nowProp === undefined ? 1000 : 60_000);
  const now = nowProp === undefined ? own : nowProp;
  const iso = at instanceof Date ? at.toISOString() : typeof at === "number" ? new Date(at).toISOString() : at;
  return (
    <time
      dateTime={iso}
      title={formatDateTime(iso)}
      className={cn("num whitespace-nowrap", fixed && "inline-block w-[8ch] shrink-0 text-right", className)}
      suppressHydrationWarning
    >
      {now === null ? "" : formatAgo(iso, now)}
    </time>
  );
}
