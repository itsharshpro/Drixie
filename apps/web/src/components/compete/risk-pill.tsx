import { cn } from "@/lib/cn";
import { RISK_LABEL, type RiskLevel } from "./persona";

export function RiskPill({ level, className, tone = "paper" }: { level: RiskLevel; className?: string; tone?: "paper" | "clear" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-caption font-medium text-ink",
        tone === "paper" ? "bg-paper/80 shadow-[0_0_0_1px_var(--line)]" : "bg-fill",
        className,
      )}
    >
      <span aria-hidden className="flex items-end gap-[2px]">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn("w-[3px] rounded-full", i <= level ? (level >= 4 ? "bg-down" : level === 3 ? "bg-gold" : "bg-ink") : "bg-line-strong")}
            style={{ height: 4 + i * 2 }}
          />
        ))}
      </span>
      {RISK_LABEL[level]}
    </span>
  );
}
