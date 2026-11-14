import { cn } from "@/lib/cn";
import { formatChange } from "@/lib/format";
import { NumberRoll } from "./number-roll";

export function ChangeChip({
  value,
  className,
  size = "md",
  suffix,
  plain,
}: {
  value: number | null | undefined;
  className?: string;
  size?: "sm" | "md";
  suffix?: string;
  plain?: boolean;
}) {
  const v = value ?? null;
  const dir = v === null || Math.abs(v) < 0.05 ? "flat" : v > 0 ? "up" : "down";

  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : null;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 whitespace-nowrap font-medium transition-colors duration-200",
        !plain && "rounded-chip",
        !plain && (size === "sm" ? "h-5 px-2 text-caption" : "h-6 px-2 text-label"),
        plain && (size === "sm" ? "text-caption" : "text-label"),
        dir === "up" && (plain ? "text-up" : "bg-up-soft text-up"),
        dir === "down" && (plain ? "text-down" : "bg-down-soft text-down"),
        dir === "flat" && (plain ? "text-ink-2" : "bg-fill text-ink-2"),
        className,
      )}
    >
      {glyph && (
        <span aria-hidden className="text-[0.7em] leading-none">
          {glyph}
        </span>
      )}
      {v === null ? (
        <span>—</span>
      ) : (
        <NumberRoll value={formatChange(v)} duration={600} />
      )}
      <span className="sr-only">{dir === "up" ? "up" : dir === "down" ? "down" : "unchanged"}</span>
      {suffix && <span className="font-sans font-normal text-ink-3">{suffix}</span>}
    </span>
  );
}
