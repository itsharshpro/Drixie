"use client";

import { scaleLinear } from "d3-scale";
import { area as areaShape, curveMonotoneX, line } from "d3-shape";
import { motion, useReducedMotion } from "motion/react";
import { useState, type PointerEvent } from "react";
import { formatTick, tickDigits } from "@/lib/format";
import { AXIS_FONT, ChartFrame, CHART_ENTRANCE, LINE_WIDTH, REDUCED_FADE } from "./chart-frame";
import { areaFill, TONE_COLOR, type SeriesTone } from "./bar-chart";
import { isolatedPoints, ok } from "./series";

export { isolatedPoints };

export interface LineSeries {
  name: string;
  tone: SeriesTone;
  values: (number | null)[];

  area?: boolean;
}

export function LineChart({
  labels,
  series,
  height = 220,
  format = (v) => v.toFixed(2),
  className,
  label,
  domain,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  format?: (v: number) => string;
  className?: string;
  label: string;
  domain?: [number, number];
}) {
  return (
    <ChartFrame height={height} className={className} label={label}>
      {(size) => <Lines labels={labels} series={series} format={format} domain={domain} {...size} />}
    </ChartFrame>
  );
}

function Lines({
  labels,
  series,
  format,
  width,
  height,
  domain,
}: {
  labels: string[];
  series: LineSeries[];
  format: (v: number) => string;
  width: number;
  height: number;
  domain?: [number, number];
}) {
  const reduce = useReducedMotion() ?? false;
  const [hover, setHover] = useState<number | null>(null);
  const compact = width < 480;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  const lo = domain?.[0] ?? Math.min(0, ...all);
  const hi = domain?.[1] ?? Math.max(...all, lo + 1e-9);

  const y = scaleLinear().domain([lo, hi]).nice(4);
  const allTicks = y.ticks(4);
  const td = tickDigits(allTicks);

  const ticks = compact && allTicks.length > 2 ? [allTicks[0]!, allTicks[allTicks.length - 1]!] : allTicks;
  const longest = Math.max(1, ...ticks.map((t) => formatTick(t, td).length));
  const gutter = Math.min(64, Math.max(28, Math.ceil(longest * 6.7) + 10));
  const m = { top: 8, right: gutter, bottom: 22, left: 0 };
  const innerW = Math.max(1, width - m.left - m.right);
  const innerH = Math.max(1, height - m.top - m.bottom);
  y.range([innerH, 0]);
  const n = labels.length;
  const x = (i: number) => (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const labelEvery = Math.ceil(n / (compact ? 3 : 6));

  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="relative h-full w-full">
      <svg width={width} height={height} className="block overflow-visible">
        <g transform={`translate(${m.left},${m.top})`}>
          {(compact ? allTicks : ticks).map((t) => (
            <line key={`g${t}`} x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4" />
          ))}
          {ticks.map((t) => (
            <text key={`t${t}`} x={innerW + 8} y={y(t)} dy="0.32em" className="num" fontSize={AXIS_FONT} fill="var(--ink-3)">
              {formatTick(t, td)}
            </text>
          ))}
          {series.map((s) => {
            if (!s.area) return null;

            const base = y.domain()[0] >= 0 ? innerH : y(0);
            const lone = new Set(isolatedPoints(s.values));
            const d =
              areaShape<number | null>()
                .defined((v, i) => ok(v) && !lone.has(i))
                .x((_, i) => x(i))
                .y0(base)
                .y1((v) => y(v as number))
                .curve(curveMonotoneX)(s.values) ?? "";
            return (
              <motion.path
                key={`${s.name}-area`}
                d={d}
                fill={areaFill(TONE_COLOR[s.tone])}
                style={{ transformOrigin: "bottom", transformBox: "fill-box" }}
                initial={reduce ? { opacity: 0 } : { scaleY: 0 }}
                animate={reduce ? { opacity: 1 } : { scaleY: 1 }}
                transition={reduce ? REDUCED_FADE : { ...CHART_ENTRANCE, delay: 0.08 }}
              />
            );
          })}
          {series.map((s, si) => {
            const d =
              line<number | null>()
                .defined((v) => v !== null && Number.isFinite(v))
                .x((_, i) => x(i))
                .y((v) => y(v as number))
                .curve(curveMonotoneX)(s.values) ?? "";
            return (
              <motion.path
                key={s.name}
                d={d}
                fill="none"
                stroke={TONE_COLOR[s.tone]}
                strokeWidth={LINE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? { opacity: 0 } : { pathLength: 0 }}
                animate={reduce ? { opacity: 1 } : { pathLength: 1 }}
                transition={reduce ? REDUCED_FADE : { ...CHART_ENTRANCE, delay: si * 0.08 }}
              />
            );
          })}
          {series.map((s) =>
            isolatedPoints(s.values).map((i) => (
              <motion.circle
                key={`${s.name}-dot-${i}`}
                cx={x(i)}
                cy={y(s.values[i] as number)}
                r={2.5}
                fill={TONE_COLOR[s.tone]}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={reduce ? REDUCED_FADE : { ...CHART_ENTRANCE, delay: 0.2 }}
              />
            )),
          )}
          {labels.map((l, i) =>
            i % labelEvery === 0 ? (
              <text key={`${l}-${i}`} x={x(i)} y={innerH + 16} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="num" fontSize={AXIS_FONT} fill="var(--ink-3)">
                {l}
              </text>
            ) : null,
          )}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={innerH} stroke="var(--line-strong)" />
              {series.map((s) => {
                const v = s.values[hover];
                return v === null || v === undefined ? null : (
                  <circle key={s.name} cx={x(hover)} cy={y(v)} r={3.5} fill="var(--paper)" stroke={TONE_COLOR[s.tone]} strokeWidth={1.5} />
                );
              })}
            </g>
          )}
          <rect x={0} y={0} width={innerW} height={innerH} fill="transparent" onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)} />
        </g>
      </svg>
      {hover !== null && (
        <div
          className="fade-in pointer-events-none absolute top-0 z-10 min-w-36 rounded-control bg-paper px-3 py-2 shadow-e2 [animation-duration:120ms]"
          style={{ left: Math.min(Math.max(0, x(hover) - 72), width - 156) }}
        >
          <div className="num text-caption text-ink-3">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-caption">
              <span className="flex items-center gap-2 text-ink-2">
                <span className="size-2 rounded-full" style={{ background: TONE_COLOR[s.tone] }} />
                {s.name}
              </span>
              <span className="num font-medium">{s.values[hover] === null || s.values[hover] === undefined ? "—" : format(s.values[hover] as number)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
