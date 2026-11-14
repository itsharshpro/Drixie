"use client";

import { scaleLinear } from "d3-scale";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { formatTick, tickDigits } from "@/lib/format";
import { AXIS_FONT, ChartFrame, CHART_ENTRANCE, REDUCED_FADE } from "./chart-frame";

export type SeriesTone =
  | "ink"
  | "muted"
  | "brand"
  | "up"
  | "down"
  | "cobalt"
  | "teal"
  | "gold"
  | "plum"
  | "clay"
  | "slate";

export const TONE_COLOR: Record<SeriesTone, string> = {
  ink: "var(--ink)",
  muted: "var(--viz-slate)",
  brand: "var(--brand)",
  up: "var(--up)",
  down: "var(--down)",
  cobalt: "var(--viz-cobalt)",
  teal: "var(--viz-teal)",
  gold: "var(--viz-gold)",
  plum: "var(--viz-plum)",
  clay: "var(--viz-clay)",
  slate: "var(--viz-slate)",
};

export const areaFill = (color: string) => `color-mix(in oklab, ${color} 10%, transparent)`;

export interface BarDatum {
  label: string;
  values: number[];
}

export function BarChart({
  data,
  series,
  height = 220,
  format = (v) => v.toFixed(2),
  className,
  label,
}: {
  data: BarDatum[];
  series: { name: string; tone: SeriesTone }[];
  height?: number;
  format?: (v: number) => string;
  className?: string;
  label: string;
}) {
  return (
    <ChartFrame height={height} className={className} label={label}>
      {(size) => <Bars data={data} series={series} format={format} {...size} />}
    </ChartFrame>
  );
}

function Bars({
  data,
  series,
  format,
  width,
  height,
}: {
  data: BarDatum[];
  series: { name: string; tone: SeriesTone }[];
  format: (v: number) => string;
  width: number;
  height: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const [hover, setHover] = useState<number | null>(null);
  const compact = width < 480;
  const all = data.flatMap((d) => d.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const y = scaleLinear().domain([min, max || 1]).nice(4);
  const allTicks = y.ticks(4);
  const td = tickDigits(allTicks);

  const ticks = compact && allTicks.length > 2 ? [allTicks[0]!, allTicks[allTicks.length - 1]!] : allTicks;
  const longest = Math.max(1, ...ticks.map((t) => formatTick(t, td).length));
  const gutter = Math.min(64, Math.max(28, Math.ceil(longest * 6.7) + 10));
  const m = { top: 8, right: gutter, bottom: 22, left: 0 };
  const innerW = Math.max(1, width - m.left - m.right);
  const innerH = Math.max(1, height - m.top - m.bottom);
  y.range([innerH, 0]);
  const groupW = innerW / Math.max(1, data.length);
  const gap = Math.min(8, groupW * 0.25);
  const barW = Math.max(2, (groupW - gap) / series.length - (series.length > 1 ? 2 : 0));
  const zero = y(0);
  const labelEvery = Math.ceil(data.length / (compact ? 3 : 6));

  return (
    <div className="relative h-full w-full">
      <svg width={width} height={height} className="block overflow-visible">
        <g transform={`translate(${m.left},${m.top})`}>
          {allTicks.map((t) => (
            <line key={`g${t}`} x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4" />
          ))}
          {ticks.map((t) => (
            <text key={`t${t}`} x={innerW + 8} y={y(t)} dy="0.32em" className="num" fontSize={AXIS_FONT} fill="var(--ink-3)">
              {formatTick(t, td)}
            </text>
          ))}
          {data.map((d, gi) => (
            <g key={d.label} transform={`translate(${gi * groupW + gap / 2},0)`} opacity={hover === null || hover === gi ? 1 : 0.45} style={{ transition: "opacity 120ms" }}>
              {d.values.map((v, si) => {
                const top = v >= 0 ? y(v) : zero;
                const h = Math.max(v === 0 ? 0 : 1, Math.abs(y(v) - zero));
                return (
                  <motion.rect
                    key={series[si]?.name ?? si}
                    x={si * (barW + 2)}
                    width={barW}
                    rx={Math.min(3, barW / 2)}
                    fill={TONE_COLOR[series[si]?.tone ?? "ink"]}
                    style={{ transformOrigin: v >= 0 ? "bottom" : "top", transformBox: "fill-box" }}
                    initial={reduce ? { opacity: 0, y: top, height: h } : { scaleY: 0, y: top, height: h }}
                    animate={reduce ? { opacity: 1, y: top, height: h } : { scaleY: 1, y: top, height: h }}
                    transition={
                      reduce
                        ? REDUCED_FADE
                        : {
                            scaleY: { ...CHART_ENTRANCE, delay: Math.min(gi, 40) * 0.03 },
                            y: { duration: 0.3, ease: CHART_ENTRANCE.ease },
                            height: { duration: 0.3, ease: CHART_ENTRANCE.ease },
                          }
                    }
                  />
                );
              })}
            </g>
          ))}
          {min < 0 && <line x1={0} x2={innerW} y1={zero} y2={zero} stroke="var(--line-strong)" />}
          {data.map((d, gi) =>
            gi % labelEvery === 0 ? (
              <text
                key={d.label}
                x={gi === 0 ? 0 : gi === data.length - 1 ? innerW : gi * groupW + groupW / 2}
                y={innerH + 16}
                textAnchor={gi === 0 ? "start" : gi === data.length - 1 ? "end" : "middle"}
                className="num"
                fontSize={AXIS_FONT}
                fill="var(--ink-3)"
              >
                {d.label}
              </text>
            ) : null,
          )}
          {data.map((d, gi) => (
            <rect
              key={`hit-${d.label}`}
              x={gi * groupW}
              y={0}
              width={groupW}
              height={innerH}
              fill="transparent"
              onPointerEnter={() => setHover(gi)}
              onPointerDown={() => setHover(gi)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </g>
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="fade-in pointer-events-none absolute top-0 z-10 min-w-36 rounded-control bg-paper px-3 py-2 shadow-e2 [animation-duration:120ms]"
          style={{ left: Math.min(Math.max(0, hover * groupW + groupW / 2 - 72), width - 156) }}
        >
          <div className="num text-caption text-ink-3">{data[hover].label}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-caption">
              <span className="flex items-center gap-2 text-ink-2">
                <span className="size-2 rounded-full" style={{ background: TONE_COLOR[s.tone] }} />
                {s.name}
              </span>
              <span className="num font-medium text-ink">{format(data[hover].values[si] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series, className }: { series: { name: string; tone: SeriesTone }[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-4 ${className ?? ""}`}>
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-2 text-caption text-ink-2">
          <span className="size-2 rounded-full" style={{ background: TONE_COLOR[s.tone] }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}
