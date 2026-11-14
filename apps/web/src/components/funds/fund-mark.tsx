import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fundColorVar, fundName } from "@/lib/funds/meta";
import { glyphDots } from "../ui/company-glyph";
import { markSize, type MarkSize } from "../ui/company-mark";
import { NAV, SharedElement } from "../ui/transitions";

const MARK: Record<MarkSize, { radius: number; glyph: number }> = {
  24: { radius: 6, glyph: 13 },
  32: { radius: 8, glyph: 17 },
  40: { radius: 10, glyph: 21 },
  56: { radius: 14, glyph: 29 },
};

const seed = (id: string) => `F:${id.toUpperCase()}`;

export function FundGlyph({ fund, box, className }: { fund: string; box: number; className?: string }) {
  const { r, dots } = glyphDots(seed(fund), box);
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className={cn("block shrink-0", className)} aria-hidden>
      <g fill={fundColorVar(fund)}>
        {dots.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </svg>
  );
}

export function FundMark({ fund, size = 40, className }: { fund: string; size?: MarkSize | number; className?: string }) {
  const s = markSize(size);
  const m = MARK[s];
  return (
    <span
      className={cn("relative inline-flex shrink-0 select-none items-center justify-center border border-line bg-paper", className)}
      style={{ width: s, height: s, borderRadius: m.radius }}
      aria-hidden
    >
      <FundGlyph fund={fund} box={m.glyph} />
    </span>
  );
}

const IDENTITY = {
  sm: { mark: 24 as MarkSize, gap: "gap-2", name: "text-label font-medium text-ink", sub: "text-caption text-ink-3" },
  md: { mark: 40 as MarkSize, gap: "gap-3", name: "text-body-sm font-medium text-ink", sub: "text-caption text-ink-3" },
  lg: { mark: 56 as MarkSize, gap: "gap-4", name: "text-title font-semibold tracking-[-0.015em] text-ink", sub: "text-body-sm text-ink-2" },
};

export function FundIdentity({
  fund,
  name,
  sub,
  size = "md",
  href,
  morph,
  trailing,
  className,
}: {
  fund: string;
  name?: string | null;
  sub?: ReactNode;
  size?: keyof typeof IDENTITY;
  href?: string;
  morph?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  const cfg = IDENTITY[size];
  const shown = fundName(fund, name);
  const mark = <FundMark fund={fund} size={cfg.mark} />;
  const nameEl = <span className={cn("truncate", cfg.name)}>{shown}</span>;
  const body = (
    <>
      {morph ? (
        <SharedElement kind="fund-mark" id={fund}>
          {mark}
        </SharedElement>
      ) : (
        mark
      )}
      <span className={cn("flex min-w-0", size === "sm" ? "items-baseline gap-1.5" : "flex-col")}>
        <span className="flex min-w-0 items-center gap-2">
          {morph ? (
            <SharedElement kind="fund-name" id={fund}>
              {nameEl}
            </SharedElement>
          ) : (
            nameEl
          )}
          {trailing}
        </span>
        {sub && <span className={cn("truncate", cfg.sub)}>{sub}</span>}
      </span>
    </>
  );
  const cls = cn("flex min-w-0 items-center", cfg.gap, className);
  if (href) {
    return (
      <Link
        href={href}
        transitionTypes={NAV.forward}
        className={cn(cls, "min-h-11 rounded-control outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand")}
      >
        {body}
      </Link>
    );
  }
  return <span className={cls}>{body}</span>;
}

export function FundDot({ fund, className }: { fund: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: fundColorVar(fund) }} />;
}
