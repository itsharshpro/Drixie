import type { CSSProperties } from "react";
import { glyphDots } from "@/components/ui/company-glyph";
import { cn } from "@/lib/cn";
import { brainLabel, fmtPct, fundColor, fundName, repTone, sparkPath, tone } from "../data/logic";

const MARK: Record<24 | 32 | 40 | 56, { radius: number; glyph: number }> = {
  24: { radius: 6, glyph: 13 },
  32: { radius: 8, glyph: 17 },
  40: { radius: 10, glyph: 21 },
  56: { radius: 14, glyph: 29 },
};

export function FundGlyph({ id, box, className }: { id: string; box: number; className?: string }) {
  const { r, dots } = glyphDots(`FUND-${id.toUpperCase()}`, box);
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className={cn("block shrink-0", className)} aria-hidden>
      <g fill={fundColor(id)}>
        {dots.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </svg>
  );
}

export function FundMark({ id, size = 40, className, lift }: { id: string; size?: 24 | 32 | 40 | 56; className?: string; lift?: boolean }) {
  const m = MARK[size];
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center border border-line bg-paper",
        lift && "shadow-[0_1px_2px_color-mix(in_oklab,var(--ink)_8%,transparent)]",
        className,
      )}
      style={{ width: size, height: size, borderRadius: m.radius }}
      aria-hidden
    >
      <FundGlyph id={id} box={m.glyph} />
    </span>
  );
}

export function FundLabel({ id, name, sub, size = "sm", className }: { id: string; name?: string; sub?: string; size?: "xs" | "sm" | "md"; className?: string }) {
  const mark = size === "md" ? 40 : size === "sm" ? 32 : 24;
  return (
    <span className={cn("flex min-w-0 items-center", size === "md" ? "gap-3" : "gap-2.5", className)}>
      <FundMark id={id} size={mark} />
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-semibold tracking-[-0.01em] text-ink", size === "md" ? "text-[16px] leading-5" : size === "sm" ? "text-[14px] leading-[18px]" : "text-[13px] leading-4")}>
          {name ?? fundName(id)}
        </span>
        {sub ? <span className="truncate text-[12px] leading-4 text-ink-3">{sub}</span> : null}
      </span>
    </span>
  );
}

export function Change({ value, className, suffix }: { value: number | null | undefined; className?: string; suffix?: string }) {
  const t = tone(value);
  return (
    <span
      className={cn(
        "v4-num inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium",
        t === "up" ? "bg-up-soft text-up" : t === "down" ? "bg-down-soft text-down" : "bg-fill text-ink-2",
        className,
      )}
    >
      {t === "up" ? "▲ " : t === "down" ? "▼ " : ""}
      {fmtPct(value)}
      {suffix ? <span className="ml-1 font-normal opacity-80">{suffix}</span> : null}
    </span>
  );
}

export function RepBadge({ score, className, size = "sm" }: { score: number | null | undefined; className?: string; size?: "sm" | "md" }) {
  const t = repTone(score);
  const color = t === "red" ? "var(--down)" : t === "amber" ? "var(--gold-text)" : t === "green" ? "var(--up)" : "var(--ink-3)";
  const bg = t === "red" ? "var(--down-soft)" : t === "amber" ? "var(--gold-soft)" : t === "green" ? "var(--up-soft)" : "var(--fill)";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium", size === "md" ? "h-7 px-2.5 text-[12.5px]" : "h-[22px] px-2 text-[11.5px]", className)}
      style={{ color, background: bg } as CSSProperties}
      title="Reputation, 0-100"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M5 .8 6.2 3.6l3 .3-2.3 2 .7 3L5 7.3 2.4 8.9l.7-3-2.3-2 3-.3Z" fill="currentColor" />
      </svg>
      <span className="v4-num">{score === null || score === undefined ? "—" : Math.round(score)}</span>
    </span>
  );
}

export function BrainChip({ tier, className }: { tier: string | null | undefined; className?: string }) {
  const bars = tier === "best" ? 3 : tier === "primary" ? 2 : tier === "small" ? 1 : 0;
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full bg-fill px-2 text-[11.5px] font-medium text-ink-2", className)}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-[3px] rounded-[1px]" style={{ height: 4 + i * 2.5, background: i < bars ? "var(--brand)" : "var(--line-strong)" }} />
        ))}
      </span>
      {brainLabel(tier)}
    </span>
  );
}

export function Spark({ values, id, width = 96, height = 28, className, area = true }: { values: readonly number[]; id: string; width?: number; height?: number; className?: string; area?: boolean }) {
  const d = sparkPath(values, width, height);
  const color = fundColor(id);
  if (!d) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("block", className)} aria-hidden>
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="var(--line-strong)" strokeDasharray="2 4" />
      </svg>
    );
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("block overflow-visible", className)} aria-hidden>
      {area ? <path d={`${d}L${width} ${height}L0 ${height}Z`} fill={color} opacity={0.1} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function LiveDot({ on = true }: { on?: boolean }) {
  return <span className="v4-live" data-tone={on ? undefined : "off"} style={{ width: 6, height: 6 }} aria-hidden />;
}

export function BellGlyph({ size = 16, className, due }: { size?: number; className?: string; due?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className={className} data-due={due || undefined}>
      <path d="M8 2.2c-2.2 0-3.7 1.7-3.7 3.9v2.4L3 10.6h10l-1.3-2.1V6.1C11.7 3.9 10.2 2.2 8 2.2Z" fill="currentColor" />
      <path d="M6.6 12.2a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
