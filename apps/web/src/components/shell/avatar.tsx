import { cn } from "@/lib/cn";

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const initial = (name.replace(/[^a-z0-9]/gi, "")[0] ?? "?").toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-paper", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
