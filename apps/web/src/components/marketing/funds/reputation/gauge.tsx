"use client";

import type { CSSProperties } from "react";
import { NumberRoll } from "@/components/ui/number-roll";
import { cn } from "@/lib/cn";

const CX = 120;
const CY = 122;
const R_VAL = 90; // value track
const R_ZONE = 108; // threshold ring

function pt(s: number, r: number): [number, number] {
  const t = Math.PI * (1 - Math.min(100, Math.max(0, s)) / 100);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return [r2(CX + r * Math.cos(t)), r2(CY - r * Math.sin(t))];
}

function arc(s0: number, s1: number, r: number): string {
  const [x0, y0] = pt(s0, r);
  const [x1, y1] = pt(s1, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export const fmtScore = (s: number) => (Number.isInteger(s) ? String(s) : s.toFixed(1));

export function RepGauge({
  score,
  color,
  size = "lg",
  reduced,
  label,
  className,
}: {
  score: number | null;

  color: string;
  size?: "lg" | "sm";
  reduced?: boolean;
  label: string;
  className?: string;
}) {
  const s = score ?? 0;
  const lg = size === "lg";
  const inAmber = score !== null && score < 40;
  const inRed = score !== null && score < 25;
  const ease = reduced ? "none" : "transform 1100ms cubic-bezier(.34,1.36,.5,1)";
  const dash = reduced ? "none" : "stroke-dashoffset 1000ms cubic-bezier(.22,1,.36,1)";
  const tick = (v: number) => {
    const [x0, y0] = pt(v, R_VAL - 12);
    const [x1, y1] = pt(v, R_ZONE + 6);
    const [tx, ty] = pt(v, R_ZONE + 17);
    return (
      <g key={v}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--paper)" strokeWidth={lg ? 3 : 4} />
        {lg ? (
          <text x={tx} y={ty + 3.5} textAnchor="middle" className="v4-num" fontSize="10.5" fontWeight={600} fill={v === 25 ? "var(--down)" : "var(--gold-text)"}>
            {v}
          </text>
        ) : null}
      </g>
    );
  };
  return (
    <div className={cn("relative mx-auto w-full", className)} role="img" aria-label={label}>
      <svg viewBox={lg ? "0 -8 240 138" : "6 6 228 124"} className="block h-auto w-full overflow-visible">
        <defs>
          <filter id={`rg-glow-${size}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>
        <path d={arc(40.6, 100, R_ZONE)} fill="none" stroke="color-mix(in oklab, var(--ink) 7%, transparent)" strokeWidth={lg ? 6 : 8} strokeLinecap="round" />
        {inAmber && !inRed ? <path d={arc(25, 40, R_ZONE)} fill="none" stroke="var(--gold)" strokeWidth={14} filter={`url(#rg-glow-${size})`} opacity={0.55} /> : null}
        {inRed ? <path d={arc(0.5, 25, R_ZONE)} fill="none" stroke="var(--candle-down)" strokeWidth={14} filter={`url(#rg-glow-${size})`} opacity={0.6} /> : null}
        <path
          d={arc(25.3, 40, R_ZONE)}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={lg ? 6 : 8}
          style={{ opacity: inAmber && !inRed ? 1 : 0.32, transition: "opacity 400ms" }}
        />
        <path
          d={arc(0, 25, R_ZONE)}
          fill="none"
          stroke="var(--candle-down)"
          strokeWidth={lg ? 6 : 8}
          strokeLinecap="round"
          style={{ opacity: inRed ? 1 : 0.32, transition: "opacity 400ms" }}
        />
        <path d={arc(0, 100, R_VAL)} fill="none" stroke="color-mix(in oklab, var(--ink) 6%, transparent)" strokeWidth={lg ? 18 : 20} strokeLinecap="round" />
        <path
          d={arc(0, 100, R_VAL)}
          pathLength={100}
          fill="none"
          stroke={color}
          strokeWidth={lg ? 18 : 20}
          strokeLinecap="round"
          strokeDasharray="100 100"
          style={{ strokeDashoffset: 100 - s, transition: dash, opacity: score === null ? 0 : 1 }}
        />
        {tick(25)}
        {tick(40)}
        <g
          style={
            {
              transform: `rotate(${s * 1.8}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transformBox: "view-box",
              transition: ease,
              opacity: score === null ? 0.25 : 1,
            } as CSSProperties
          }
        >
          <path d={`M${CX - (R_VAL + 4)} ${CY} L${CX} ${CY - 4.2} L${CX} ${CY + 4.2} Z`} fill="var(--ink)" />
        </g>
        <circle cx={CX} cy={CY} r={lg ? 9 : 11} fill="var(--ink)" />
        <circle cx={CX} cy={CY} r={lg ? 3.5 : 4.5} fill="var(--paper)" />
      </svg>
      {lg ? (
        <div className="mt-1 flex justify-center">
          <span className="v4-num text-[34px] font-semibold leading-[40px] tracking-[-0.04em] text-ink md:text-[52px] md:leading-[56px]">
            {score === null ? "–" : <NumberRoll value={fmtScore(s)} duration={700} label={`${fmtScore(s)} out of 100`} />}
          </span>
        </div>
      ) : null}
    </div>
  );
}
