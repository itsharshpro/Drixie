"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { Card, CARD_TITLE } from "../ui/card";
import { ChangeChip } from "../ui/change-chip";
import { NumberRoll } from "../ui/number-roll";

export function ChartFrame({
  height,
  className,
  children,
  label,
}: {
  height: number | string;
  className?: string;
  children: (size: { width: number; height: number }) => ReactNode;
  label: string;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  return (
    <div ref={ref} role="img" aria-label={label} className={cn("relative w-full min-w-0", className)} style={{ height }}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}

export const CHART_ENTRANCE = { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] as const };
export const REDUCED_FADE = { duration: 0.15, ease: "linear" as const };

export const AXIS_FONT = 11;

export const LINE_WIDTH = 1.75;

export interface ChartCardProps {

  title: ReactNode;

  sub: ReactNode;

  value?: string | null;

  unit?: string;

  change?: number | null;

  changeLabel?: string;

  controls?: ReactNode;

  action?: ReactNode;

  legend?: ReactNode;

  footnote?: ReactNode;
  children: ReactNode;
  className?: string;

  plotClassName?: string;

  interactive?: boolean;
}

export function ChartCard({
  title,
  sub,
  value,
  unit,
  change,
  changeLabel,
  controls,
  action,
  legend,
  footnote,
  children,
  className,
  plotClassName,
  interactive,
}: ChartCardProps) {
  const id = useId();
  const hasValue = value !== undefined;
  return (
    <Card as="section" padded interactive={interactive} aria-labelledby={id} className={cn("flex min-w-0 flex-col", className)}>
      <header className="flex min-h-11 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={id} className={cn("truncate", CARD_TITLE)}>
            {title}
          </h2>
          <p className="truncate text-caption text-ink-3">{sub}</p>
        </div>
        {(controls || action) && (
          <div className="-my-1.5 -mr-2 flex shrink-0 items-center gap-2">
            {controls}
            {action}
          </div>
        )}
      </header>
      {hasValue && (
        <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          {value === null ? (
            <span className="num text-title font-semibold tracking-[-0.02em] text-ink-3">—</span>
          ) : (
            <NumberRoll value={value} className="text-title font-semibold tracking-[-0.02em] text-ink" />
          )}
          {unit && value !== null && <span className="text-label font-medium text-ink-3">{unit}</span>}
          {change !== undefined && <ChangeChip value={change} size="sm" suffix={changeLabel} className="self-center" />}
        </div>
      )}
      <div className={cn("mt-4 min-w-0 flex-1", plotClassName)}>{children}</div>
      {(legend || footnote) && (
        <footer className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-caption text-ink-3">
          {legend ? <div className="min-w-0">{legend}</div> : <span />}
          {footnote && <p className="min-w-0">{footnote}</p>}
        </footer>
      )}
    </Card>
  );
}

export function ChartCardSkeleton({ height = 220, value, className }: { height?: number; value?: boolean; className?: string }) {
  return (
    <Card padded className={cn("flex flex-col", className)} aria-hidden>
      <div className="flex min-h-11 flex-col gap-1.5">
        <span className="skeleton block h-5 w-36 rounded-chip" />
        <span className="skeleton block h-3.5 w-28 rounded-chip" />
      </div>
      {value && <span className="skeleton mt-3 block h-8 w-32 rounded-control" />}
      <div className="mt-4 flex flex-col justify-end gap-2" style={{ height }}>
        <span className="skeleton block flex-1 rounded-control" />
        <span className="block border-t border-line-strong" />
      </div>
      <span className="skeleton mt-4 block h-3.5 w-40 rounded-chip" />
    </Card>
  );
}
