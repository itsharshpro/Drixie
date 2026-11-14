"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { reputationTone } from "@/lib/funds/meta";
import { NumberRoll } from "./number-roll";

const TONE = { red: "var(--down)", amber: "var(--gold)", green: "var(--up)" } as const;
const WORD = { red: "Not trusted", amber: "Watch it", green: "Trusted" } as const;

export interface ReputationGaugeProps {
  score: number | null | undefined;
  size?: 40 | 64 | 96 | 160;

  showValue?: boolean;
  className?: string;
}

export function ReputationGauge({ score, size = 96, showValue, className }: ReputationGaugeProps) {
  const reduce = useReducedMotion() ?? false;
  const s = score === null || score === undefined || !Number.isFinite(score) ? null : Math.max(0, Math.min(100, score));

  const [shown, setShown] = useState<number>(reduce ? (s ?? 0) : 0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(s ?? 0));
    return () => cancelAnimationFrame(id);
  }, [s]);

  const sw = size <= 40 ? 4 : size <= 64 ? 6 : size <= 96 ? 8 : 12;
  const cx = size / 2;
  const r = size / 2 - sw / 2;
  const cy = r + sw / 2;
  const h = cy + (size <= 40 ? 3 : sw * 0.75);
  const len = Math.PI * r;
  const at = (v: number) => {
    const th = Math.PI * (1 - v / 100);
    return [cx + r * Math.cos(th), cy - r * Math.sin(th)] as const;
  };
  const arc = (a: number, b: number) => {
    const [x1, y1] = at(a);
    const [x2, y2] = at(b);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const tone = s === null ? null : reputationTone(s);
  const color = tone ? TONE[tone] : "var(--line-strong)";
  const value = showValue ?? size >= 64;
  const needle = r - sw * (size <= 40 ? 0.2 : 0.9);
  const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  const dur = reduce ? "0ms" : "700ms";

  return (
    <span
      className={cn("relative inline-flex shrink-0 flex-col items-center", className)}
      style={{ width: size }}
      role="img"
      aria-label={s === null ? "Reputation not scored yet" : `Reputation ${Math.round(s)} out of 100${tone ? `, ${WORD[tone].toLowerCase()}` : ""}`}
    >
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} className="block overflow-visible" aria-hidden>
        <path d={arc(0, 100)} fill="none" stroke="var(--fill)" strokeWidth={sw} strokeLinecap="round" />
        <path d={arc(0.5, 25)} fill="none" stroke="var(--down-soft)" strokeWidth={sw} />
        <path d={arc(25, 40)} fill="none" stroke="var(--gold-soft)" strokeWidth={sw} />
        <path
          d={arc(0, 100)}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - shown / 100)}
          style={{ transition: `stroke-dashoffset ${dur} ${ease}, stroke 200ms linear` }}
        />
        {size >= 64 &&
          [25, 40].map((m) => {
            const th = Math.PI * (1 - m / 100);
            const x1 = cx + (r + sw / 2 + 1) * Math.cos(th);
            const y1 = cy - (r + sw / 2 + 1) * Math.sin(th);
            const x2 = cx + (r - sw / 2 - 1) * Math.cos(th);
            const y2 = cy - (r - sw / 2 - 1) * Math.sin(th);
            return <line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--paper)" strokeWidth={size >= 160 ? 2 : 1.5} />;
          })}
        <g style={{ transform: `rotate(${-90 + (shown / 100) * 180}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: `transform ${dur} ${ease}` }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - needle} stroke="var(--ink)" strokeWidth={size <= 40 ? 1.5 : size <= 96 ? 2 : 2.5} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={size <= 40 ? 2.5 : size <= 96 ? 4 : 6} fill="var(--ink)" />
        <circle cx={cx} cy={cy} r={size <= 40 ? 1 : size <= 96 ? 1.5 : 2.5} fill="var(--paper)" />
      </svg>
      {value && (
        <span className={cn("flex flex-col items-center", size >= 160 ? "mt-2" : "mt-1")}>
          <span className={cn("num font-semibold leading-none text-ink", size >= 160 ? "text-[32px]" : size >= 96 ? "text-[20px]" : "text-[15px]")}>
            {s === null ? "—" : <NumberRoll value={String(Math.round(s))} />}
          </span>
          {size >= 160 && tone && <span className="mt-1.5 text-caption font-medium" style={{ color: tone === "amber" ? "var(--gold-text)" : TONE[tone] }}>{WORD[tone]}</span>}
        </span>
      )}
    </span>
  );
}
