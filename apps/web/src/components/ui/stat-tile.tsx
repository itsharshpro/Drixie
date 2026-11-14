"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { SeriesTone } from "../charts/bar-chart";
import { Sparkline } from "../charts/sparkline";
import { Card, CARD_PAD } from "./card";
import { NumberRoll } from "./number-roll";
import { Skeleton } from "./skeleton";
import { SharedElement, SwapText } from "./transitions";

export const KPI_GRID = "grid grid-cols-2 gap-4 md:gap-5 lg:grid-cols-4 lg:gap-6";

export function KpiGrid({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={cn(KPI_GRID, className)}>
      {children}
    </section>
  );
}

export function drawableSeries(series: readonly number[] | undefined): number[] {
  if (!series) return [];
  const clean = series.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return [];
  const first = clean[0];
  return clean.some((v) => v !== first) ? clean : [];
}

export type StatTone = "up" | "down" | "gold" | "brand" | null;

export interface StatTileProps {
  label: string;

  value: string | null;
  unit?: string;
  sub?: string | null;
  tone?: StatTone;
  icon?: ReactNode;

  series?: readonly number[];

  seriesTone?: SeriesTone | "auto";

  href?: string;

  id?: string;

  rollOnMount?: boolean;
  className?: string;
}

const TONE_TEXT: Record<Exclude<StatTone, null>, string> = {
  up: "text-up",
  down: "text-down",
  gold: "text-gold-text",
  brand: "text-brand",
};

const VALUE = "text-title font-semibold tracking-[-0.02em] md:text-display-sm";

export function StatTile({ label, value, unit, sub, tone, icon, series, seriesTone = "ink", href, id, rollOnMount, className }: StatTileProps) {
  const points = drawableSeries(series);
  const number =
    value === null ? (
      <span className={cn("num text-ink-3", VALUE)}>—</span>
    ) : (
      <NumberRoll value={value} rollOnMount={rollOnMount} className={cn(VALUE, tone && TONE_TEXT[tone])} />
    );
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 truncate text-caption font-medium text-ink-2">
        {icon}
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        {id ? (
          <SharedElement kind="kpi" id={id}>
            {number}
          </SharedElement>
        ) : (
          number
        )}
        {unit && value !== null && <span className="text-label font-medium text-ink-3">{unit}</span>}
      </div>
      <div className="min-h-4 truncate text-caption text-ink-2">{sub ? <SwapText value={sub} /> : null}</div>
      {series !== undefined && (
        <div className="-mx-1 mt-auto" title={points.length ? undefined : "The trend fills in after a few earnings bells"}>
          <Sparkline values={points} height={40} tone={seriesTone} label={points.length ? `${label} trend` : `${label}: no trend yet`} />
        </div>
      )}
    </>
  );
  const cls = cn("flex min-w-0 flex-col gap-2 md:gap-3", series !== undefined && "overflow-hidden", CARD_PAD, className);
  if (href) {
    return (
      <Card interactive className="p-0">
        <Link
          href={href}
          className={cn(cls, "h-full rounded-card outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand")}
        >
          {body}
        </Link>
      </Card>
    );
  }
  return <Card className={cls}>{body}</Card>;
}

export function StatTileSkeleton({ className, series }: { className?: string; series?: boolean }) {
  return (
    <Card className={cn("flex flex-col gap-2 md:gap-3", CARD_PAD, className)} aria-hidden>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-28 rounded-control md:h-10 md:w-32" />
      <Skeleton className="h-4 w-24" />
      {series && <Skeleton className="mt-auto h-10 w-full rounded-control" />}
    </Card>
  );
}
