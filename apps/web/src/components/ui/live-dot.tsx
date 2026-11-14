import { cn } from "@/lib/cn";

export function LiveDot({ tone = "live", className }: { tone?: "live" | "connecting" | "offline" | "brand"; className?: string }) {
  const color = tone === "live" ? "bg-up" : tone === "offline" ? "bg-down" : tone === "brand" ? "bg-brand" : "bg-ink-3";
  return (
    <span className={cn("relative inline-flex size-2", className)} aria-hidden>
      {(tone === "live" || tone === "brand") && <span className={cn("live-ping absolute inset-0 rounded-full", color)} />}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}
