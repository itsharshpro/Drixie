"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Card } from "../ui/card";

const START = 60;
const LOSES = [
  { label: "Flip-flop", d: -3 },
  { label: "Front-running", d: -5 },
  { label: "Pump & dump", d: -15 },
  { label: "Missed promise", d: -25 },
];
const GAINS = [
  { label: "Beat SPY", d: 3 },
  { label: "Kept promise", d: 10 },
];

const W = 200;
const CX = 100;
const CY = 104;
const R = 80;
const SW = 14;
const H = CY + 18;

const at = (v: number, r = R) => {
  const th = Math.PI * (1 - v / 100);
  return [CX + r * Math.cos(th), CY - r * Math.sin(th)] as const;
};
const arc = (a: number, b: number) => {
  const [x1, y1] = at(a);
  const [x2, y2] = at(b);
  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
};

function Gauge() {
  const reduce = useReducedMotion() ?? false;
  const [shown, setShown] = useState(reduce ? START : 0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(START));
    return () => cancelAnimationFrame(id);
  }, []);
  const dur = reduce ? "0ms" : "900ms";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Reputation from 0 to 100. Every fund starts at 60.">
      <path d={arc(0, 100)} fill="none" stroke="var(--up-soft)" strokeWidth={SW} strokeLinecap="round" />
      <path d={arc(0, 1)} fill="none" stroke="var(--down-soft)" strokeWidth={SW} strokeLinecap="round" />
      <path d={arc(0, 25)} fill="none" stroke="var(--down-soft)" strokeWidth={SW} />
      <path d={arc(25, 40)} fill="none" stroke="var(--gold-soft)" strokeWidth={SW} />
      {[25, 40].map((m) => {
        const [x1, y1] = at(m, R + SW / 2 + 1);
        const [x2, y2] = at(m, R - SW / 2 - 1);
        const [tx, ty] = at(m, R + SW / 2 + 9);
        return (
          <g key={m}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--paper)" strokeWidth={2.5} />
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" className="num fill-[var(--ink-3)] text-[10px] font-medium">
              {m}
            </text>
          </g>
        );
      })}
      <text x={at(0)[0]} y={H - 1} textAnchor="middle" className="num fill-[var(--ink-3)] text-[10px]">0</text>
      <text x={at(100)[0]} y={H - 1} textAnchor="middle" className="num fill-[var(--ink-3)] text-[10px]">100</text>
      <g
        style={{
          transform: `rotate(${-90 + (shown / 100) * 180}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: `transform ${dur} cubic-bezier(0.2, 0.8, 0.2, 1)`,
        }}
      >
        <line x1={CX} y1={CY} x2={CX} y2={CY - R + SW} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
      </g>
      <circle cx={CX} cy={CY} r={6} fill="var(--ink)" />
      <circle cx={CX} cy={CY} r={2.5} fill="var(--paper)" />
    </svg>
  );
}

function Delta({ label, d }: { label: string; d: number }) {
  const up = d > 0;
  return (
    <li
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-caption transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none",
        up ? "bg-up-soft" : "bg-down-soft",
      )}
    >
      <span className="text-ink">{label}</span>
      <span className={cn("num font-semibold", up ? "text-up" : "text-down")}>
        {up ? "+" : "−"}
        {Math.abs(d)}
      </span>
    </li>
  );
}

export function ReputationGlance({ className }: { className?: string }) {
  return (
    <Card as="section" aria-labelledby="guide-rep-h" className={cn("flex flex-col p-4 md:p-5", className)}>
      <h2 id="guide-rep-h" className="text-body font-semibold tracking-[-0.01em] text-ink">
        Reputation at a glance
      </h2>
      <div className="mt-3 grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col items-center md:order-2">
          <Gauge />
          <p className="mt-1 text-caption text-ink-2">
            Every fund starts at <span className="num font-semibold text-ink">{START}</span>
          </p>
        </div>
        <div className="flex flex-col gap-1.5 md:order-1 md:items-end">
          <p className="text-caption font-medium text-ink-3">Loses</p>
          <ul className="flex flex-wrap gap-1.5 md:flex-col md:items-end">
            {LOSES.map((x) => (
              <Delta key={x.label} {...x} />
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5 md:order-3 md:items-start">
          <p className="text-caption font-medium text-ink-3">Gains</p>
          <ul className="flex flex-wrap gap-1.5 md:flex-col md:items-start">
            {GAINS.map((x) => (
              <Delta key={x.label} {...x} />
            ))}
          </ul>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-caption text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-gold" aria-hidden />
          <span>
            Under <span className="num font-semibold text-ink">40</span>: AI funds stop buying
          </span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-down" aria-hidden />
          <span>
            Under <span className="num font-semibold text-ink">25</span>: anyone leaves fee-free
          </span>
        </li>
      </ul>
    </Card>
  );
}
