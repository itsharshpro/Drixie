import { companyColorVar } from "@listed/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { serviceLabel } from "@/lib/format";
import { glyphDots } from "./company-glyph";
import { NAV, SharedElement } from "./transitions";

export type MarkSize = 24 | 32 | 40 | 56;

export function markSize(size: number): MarkSize {
  if (size <= 28) return 24;
  if (size <= 36) return 32;
  if (size <= 48) return 40;
  return 56;
}

const MARK: Record<MarkSize, { radius: number; glyph: number }> = {
  24: { radius: 6, glyph: 13 },
  32: { radius: 8, glyph: 17 },
  40: { radius: 10, glyph: 21 },
  56: { radius: 14, glyph: 29 },
};

export function CompanyGlyph({ ticker, box, className }: { ticker: string; box: number; className?: string }) {
  const { r, dots } = glyphDots(ticker, box);
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className={cn("block shrink-0", className)} aria-hidden>
      <g fill={companyColorVar(ticker)}>
        {dots.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </svg>
  );
}

export function CompanyMark({
  ticker,
  size = 40,
  className,
  on = "paper",
}: {
  ticker: string;

  size?: MarkSize | number;
  className?: string;

  on?: "paper" | "pastel";
}) {
  const s = markSize(size);
  const m = MARK[s];
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center border border-line bg-paper",
        on === "pastel" && "shadow-[0_1px_2px_color-mix(in_oklab,var(--ink)_8%,transparent)]",
        className,
      )}
      style={{ width: s, height: s, borderRadius: m.radius }}
      aria-hidden
    >
      <CompanyGlyph ticker={ticker.toUpperCase()} box={m.glyph} />
    </span>
  );
}

export type IdentitySize = "sm" | "md" | "lg";

const IDENTITY: Record<IdentitySize, { mark: MarkSize; gap: string; name: string; sub: string }> = {
  sm: { mark: 24, gap: "gap-2", name: "text-label font-medium text-ink", sub: "text-caption text-ink-3" },
  md: { mark: 40, gap: "gap-3", name: "text-body-sm font-medium text-ink", sub: "text-caption text-ink-3" },
  lg: { mark: 56, gap: "gap-4", name: "text-title font-semibold tracking-[-0.015em] text-ink", sub: "text-body-sm text-ink-2" },
};

export function CompanyIdentity({
  ticker,
  name,
  service,
  size = "md",
  href,
  morph,
  className,
  trailing,
}: {
  ticker: string;
  name?: string | null;

  service?: string | null;
  size?: IdentitySize;

  href?: string;

  morph?: boolean;
  className?: string;

  trailing?: ReactNode;
}) {
  const t = ticker.toUpperCase();
  const cfg = IDENTITY[size];
  const shownName = name?.trim() || t;
  const mark = <CompanyMark ticker={t} size={cfg.mark} />;
  const nameEl = <span className={cn("truncate", cfg.name)}>{shownName}</span>;
  const svc = service ? serviceLabel(service) : null;
  const body = (
    <>
      {morph ? (
        <SharedElement kind="company-mark" id={t}>
          {mark}
        </SharedElement>
      ) : (
        mark
      )}
      {size === "sm" ? (
        <span className="flex min-w-0 items-baseline gap-1.5">
          {morph ? (
            <SharedElement kind="company-name" id={t}>
              {nameEl}
            </SharedElement>
          ) : (
            nameEl
          )}
          {shownName !== t && <span className="num shrink-0 text-caption text-ink-3">{t}</span>}
          {trailing}
        </span>
      ) : (
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            {morph ? (
              <SharedElement kind="company-name" id={t}>
                {nameEl}
              </SharedElement>
            ) : (
              nameEl
            )}
            {trailing}
          </span>
          <span className={cn("truncate", cfg.sub)}>
            {shownName !== t && <span className="num">{t}</span>}
            {shownName !== t && svc && " · "}
            {svc}
          </span>
        </span>
      )}
    </>
  );
  const cls = cn("flex min-w-0 items-center", cfg.gap, className);
  if (href) {
    return (
      <Link
        href={href}
        transitionTypes={NAV.forward}
        className={cn(cls, "rounded-control outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand")}
      >
        {body}
      </Link>
    );
  }
  return <span className={cls}>{body}</span>;
}
