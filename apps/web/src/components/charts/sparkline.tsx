"use client";
import { line, area, curveMonotoneX } from "d3-shape";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { useMorph } from "@/lib/hooks/use-morph";
import { areaFill, TONE_COLOR, type SeriesTone } from "./bar-chart";
import { ChartFrame, CHART_ENTRANCE, REDUCED_FADE } from "./chart-frame";

export function Sparkline({
  values,
  height = 36,
  tone = "ink",
  fill = true,
  className,
  label,
  strokeWidth = 1.5,
  color: colorProp,
}: {
  values: number[];
  height?: number;
  tone?: SeriesTone | "auto";
  color?: string;
  fill?: boolean;
  className?: string;
  label?: string;
  strokeWidth?: number;
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  const dir = clean.length > 1 ? (clean[clean.length - 1] >= clean[0] ? "up" : "down") : "flat";
  const color =
    colorProp ?? (tone === "auto" ? (dir === "up" ? "var(--up)" : dir === "down" ? "var(--down)" : "var(--ink)") : TONE_COLOR[tone]);
  return (
    <ChartFrame height={height} className={className} label={label ?? `Trend over the last ${clean.length} points`}>
      {(size) => <SparkSvg values={clean} {...size} color={color} fill={fill} strokeWidth={strokeWidth} />}
    </ChartFrame>
  );
}

function SparkSvg({
  values,
  width,
  height,
  color,
  fill,
  strokeWidth,
}: {
  values: number[];
  width: number;
  height: number;
  color: string;
  fill: boolean;
  strokeWidth: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const shown = useMorph(values, 300, reduce);
  const clipId = useId();
  if (shown.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden>
        <line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke="var(--line-strong)" strokeDasharray="2 4" />
      </svg>
    );
  }
  const min = Math.min(...shown);
  const max = Math.max(...shown);
  const pad = strokeWidth + 1;

  const flat = max - min < 1e-12;
  const flatY = max === 0 ? height - pad : height / 2;
  const span = max - min || 1;
  const x = (i: number) => (i / (shown.length - 1)) * (width - pad * 2) + pad;
  const y = (v: number) => (flat ? flatY : pad + (1 - (v - min) / span) * (height - pad * 2));
  const linePath = line<number>().x((_, i) => x(i)).y(y).curve(curveMonotoneX)(shown) ?? "";
  const areaPath = area<number>().x((_, i) => x(i)).y0(height).y1(y).curve(curveMonotoneX)(shown) ?? "";
  const lastX = x(shown.length - 1);
  const lastY = y(shown[shown.length - 1]);

  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <defs>
        <clipPath id={clipId}>
          <rect x={-4} y={-4} width={width + 8} height={height + 8} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {fill && !flat && (
          <motion.path
            d={areaPath}
            fill={areaFill(color)}
            style={{ transformOrigin: "bottom", transformBox: "fill-box" }}
            initial={reduce ? { opacity: 0 } : { scaleY: 0 }}
            animate={reduce ? { opacity: 1 } : { scaleY: 1 }}
            transition={reduce ? REDUCED_FADE : { ...CHART_ENTRANCE, delay: 0.08 }}
          />
        )}
        <motion.path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? { opacity: 0 } : { pathLength: 0 }}
          animate={reduce ? { opacity: 1 } : { pathLength: 1 }}
          transition={reduce ? REDUCED_FADE : CHART_ENTRANCE}
        />
        <motion.circle
          cx={lastX}
          cy={lastY}
          r={2.25}
          fill={color}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.55, duration: 0.2 }}
        />
      </g>
    </svg>
  );
}
