"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useMemo, useRef, useState } from "react";
import type { ReputationChange } from "../../../../../../../packages/reputation/src/index";
import { cn } from "@/lib/cn";
import { useReducedMotionSafe } from "../../v4/primitives";
import { runStory, type StoryFund } from "../data/rep-story";
import { fmtScore, RepGauge } from "./gauge";

const KIND: Record<string, string> = {
  flip_flop: "Flip-flop",
  front_running: "Front-running",
  pump_dump: "Pump & dump",
  missed_promise: "Missed promise",
  turnover_excess: "Over-trading",
  broken_deal: "Broken deal",
  low_churn: "Low-churn day",
  beat_spy: "Beat SPY",
  honoured_deal: "Honoured deal",
  kept_promise: "Kept promise",
};
export const kindLabel = (k: string) => KIND[k] ?? k.replace(/_/g, " ");
const signed = (n: number) => `${n > 0 ? "+" : "−"}${fmtScore(Math.abs(n))}`;

const SIDE = {
  steady: {
    name: "Steady",
    line: "Trades little, keeps promises",
    tint: "color-mix(in oklab, var(--sky) 34%, #fff)",
    strong: "color-mix(in oklab, var(--sky) 30%, var(--brand))",
    dot: "var(--sky)",
  },
  manipulator: {
    name: "Manipulator",
    line: "Games the rules",
    tint: "color-mix(in oklab, var(--pink) 30%, #fff)",
    strong: "color-mix(in oklab, var(--pink) 45%, var(--candle-down))",
    dot: "var(--pink)",
  },
} as const;

const MONEY: Record<StoryFund, number[]> = {
  steady: [180, 184, 192, 198, 244, 256, 322],
  manipulator: [180, 171, 156, 158, 92, 88, 22],
};
const MONEY_MAX = 340;

type Shape = "drift" | "chop" | "gap" | "pump" | "crash";
const COIN: Record<StoryFund, { to: number; shape: Shape }[]> = {
  steady: [
    { to: 10, shape: "drift" },
    { to: 10.06, shape: "drift" },
    { to: 10.12, shape: "drift" },
    { to: 10.34, shape: "drift" },
    { to: 10.52, shape: "drift" },
    { to: 10.7, shape: "drift" },
    { to: 10.95, shape: "drift" },
  ],
  manipulator: [
    { to: 10, shape: "drift" },
    { to: 9.72, shape: "chop" },
    { to: 9.38, shape: "gap" },
    { to: 9.44, shape: "drift" },
    { to: 8.3, shape: "pump" },
    { to: 8.22, shape: "drift" },
    { to: 6.1, shape: "crash" },
  ],
};
const PER = 4; // candles per beat

interface C {
  o: number;
  h: number;
  l: number;
  c: number;
}

function rand(seed: number) {
  let t = Math.imul(seed + 0x9e3779b9, 0x85ebca6b) >>> 0;
  t ^= t >>> 13;
  t = Math.imul(t, 0xc2b2ae35) >>> 0;
  t ^= t >>> 16;
  return t / 4294967296;
}

function buildCandles(fund: StoryFund): C[][] {
  const out: C[][] = [];
  let prev = 10;
  COIN[fund].forEach((b, bi) => {
    const list: C[] = [];
    for (let i = 0; i < PER; i++) {
      const seed = bi * 10 + i + (fund === "steady" ? 0 : 500);
      const n = (rand(seed) - 0.5) * (fund === "steady" ? 0.1 : 0.3);
      let o = prev;
      let c: number;
      const frac = (i + 1) / PER;
      const start = out.length ? out[out.length - 1]![PER - 1]!.c : 10;
      if (b.shape === "pump") {
        const path = [start + 0.5, start + 1.05, start - 0.4, b.to];
        c = path[i]!;
      } else if (b.shape === "crash") {
        if (i === 0) o = prev - 0.9; // gap down
        c = i === PER - 1 ? b.to : start + (b.to - start) * frac + n * 2;
      } else if (b.shape === "gap") {
        if (i === 0) o = prev - 0.32;
        c = i === PER - 1 ? b.to : start + (b.to - start) * frac + n;
      } else if (b.shape === "chop") {
        c = i === PER - 1 ? b.to : start + (i % 2 ? -0.42 : 0.36) + n;
      } else {
        c = i === PER - 1 && bi > 0 ? b.to : start + (b.to - start) * frac + n * (bi === 0 ? 1.4 : 1) + (i % 2 ? -0.05 : 0.04);
      }
      const span = Math.abs(c - o);
      const wick = fund === "steady" ? 0.05 : 0.14;
      const h = Math.max(o, c) + wick * 0.4 + rand(seed + 1) * (wick + span * 0.3);
      const l = Math.min(o, c) - wick * 0.4 - rand(seed + 2) * (wick + span * 0.3);
      list.push({ o, h, l, c });
      prev = c;
    }
    out.push(list);
  });
  return out;
}

function Candles({ fund, beat, reduced }: { fund: StoryFund; beat: number; reduced: boolean }) {
  const groups = useMemo(() => buildCandles(fund), [fund]);
  const all = groups.flat();
  const [lo, hi] = fund === "steady" ? [9.72, 11.08] : [5.55, 11.1];
  const W = 280;
  const H = 96;
  const slot = W / all.length;
  const y = (v: number) => Math.round((4 + (1 - (v - lo) / (hi - lo)) * (H - 8)) * 100) / 100;
  const shown = (beat + 1) * PER;
  const last = all[shown - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[76px] w-full md:h-[104px]" aria-hidden>
      <line x1="0" x2={W} y1={y(10)} y2={y(10)} stroke="color-mix(in oklab, var(--ink) 12%, transparent)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      {all.map((k, i) => {
        const on = i < shown;
        const up = k.c >= k.o;
        const col = up ? "var(--candle-up)" : "var(--candle-down)";
        const x = Math.round((i * slot + slot / 2) * 100) / 100;
        const top = y(Math.max(k.o, k.c));
        const bh = Math.round(Math.max(1.2, Math.abs(y(k.o) - y(k.c))) * 100) / 100;
        return (
          <g
            key={i}
            style={{
              opacity: on ? 1 : 0,
              transform: on ? "none" : "translateY(6px)",
              transition: reduced ? "none" : `opacity 260ms ${(i % PER) * 70}ms, transform 360ms ${(i % PER) * 70}ms cubic-bezier(.22,1,.36,1)`,
            }}
          >
            <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <rect x={Math.round((x - slot * 0.32) * 100) / 100} y={top} width={Math.round(slot * 64) / 100} height={bh} rx="0.8" fill={col} />
          </g>
        );
      })}
      {last ? (
        <line x1="0" x2={W} y1={y(last.c)} y2={y(last.c)} stroke={last.c >= 10 ? "var(--candle-up)" : "var(--candle-down)"} strokeWidth="1" strokeDasharray="1 3" vectorEffect="non-scaling-stroke" opacity={0.7} />
      ) : null}
    </svg>
  );
}

function Chip({ c, i, reduced }: { c: ReputationChange; i: number; reduced: boolean }) {
  const good = c.delta >= 0;
  return (
    <motion.span
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 22, delay: 0.08 + i * 0.12 }}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium shadow-[0_6px_16px_-8px_rgba(15,17,23,0.35)] md:h-8 md:px-3 md:text-[12.5px]",
        good ? "bg-[color-mix(in_oklab,var(--mint)_70%,#fff)] text-up" : c.delta <= -15 ? "bg-candle-down text-paper" : "bg-paper text-down ring-1 ring-[color-mix(in_oklab,var(--candle-down)_35%,transparent)]",
      )}
    >
      <span>{kindLabel(c.kind)}</span>
      <span className="v4-num font-semibold">{signed(c.capped ? c.raw : c.delta)}</span>
      {c.capped ? <span className="v4-num hidden rounded-full bg-paper/70 px-1.5 text-[10.5px] text-ink-2 md:inline">capped {signed(c.delta)}</span> : null}
    </motion.span>
  );
}

function Column({
  fund,
  beat,
  score,
  changes,
  reduced,
}: {
  fund: StoryFund;
  beat: number;
  score: number;
  changes: ReputationChange[];
  reduced: boolean;
}) {
  const s = SIDE[fund];
  const zone = score < 25 ? "red" : score < 40 ? "amber" : "ok";
  const money = MONEY[fund][beat] ?? 0;
  const mine = changes.filter((c) => c.fund === fund);
  return (
    <div className="relative flex min-w-0 flex-col items-center rounded-[20px] px-2.5 pb-3 pt-3 md:rounded-[24px] md:px-6 md:pb-5 md:pt-5" style={{ background: s.tint }}>
      <div className="flex w-full items-center justify-center gap-2">
        <span className="size-2.5 rounded-full ring-2 ring-paper md:size-3" style={{ background: s.strong }} />
        <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink md:text-[17px]">{s.name}</span>
        <span className="hidden text-[12.5px] text-ink-3 lg:inline">· {s.line}</span>
      </div>
      <div className="mt-2 flex h-[64px] w-full flex-wrap content-center items-center justify-center gap-1.5 md:h-[40px] md:flex-nowrap">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={beat}
            className="flex flex-wrap items-center justify-center gap-1.5 md:flex-nowrap"
            exit={{ opacity: 0, y: reduced ? 0 : -8 }}
            transition={{ duration: 0.14 }}
          >
            {mine.map((c, i) => (
              <Chip key={c.id} c={c} i={i} reduced={reduced} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <RepGauge
        score={score}
        color={s.strong}
        reduced={reduced}
        label={`${s.name} reputation ${fmtScore(score)} out of 100`}
        className="mt-1 max-w-[300px]"
      />
      <div
        className={cn(
          "mt-2 inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[10.5px] font-medium transition-colors duration-300 md:text-[12.5px]",
          zone === "red" ? "bg-candle-down text-paper" : zone === "amber" ? "bg-[color-mix(in_oklab,var(--gold)_22%,#fff)] text-gold-text" : "bg-paper/70 text-ink-2",
        )}
      >
        <span className={cn("size-1.5 rounded-full", zone === "red" ? "bg-paper" : zone === "amber" ? "bg-gold" : "bg-candle-up")} />
        {zone === "red" ? (
          <>
            <span className="md:hidden">Under 25 · free exit</span>
            <span className="hidden md:inline">Under 25 · anyone leaves fee-free</span>
          </>
        ) : zone === "amber" ? (
          <>
            <span className="md:hidden">Under 40 · AI funds stop</span>
            <span className="hidden md:inline">Under 40 · AI funds stop buying</span>
          </>
        ) : (
          "Trusted"
        )}
      </div>
      <div className="mt-3 w-full rounded-[14px] bg-paper/80 px-1.5 py-1.5 md:mt-4 md:px-2">
        <div className="flex items-center justify-between px-1 text-[10.5px] text-ink-3 md:text-[11.5px]">
          <span>{s.name} coin</span>
          <span className="v4-num">${(COIN[fund][beat]?.to ?? 10).toFixed(2)}</span>
        </div>
        <Candles fund={fund} beat={beat} reduced={reduced} />
      </div>
      <div className="mt-3 w-full px-0.5 md:mt-4">
        <div className="flex items-baseline justify-between text-[11px] md:text-[12.5px]">
          <span className="text-ink-2">Outside money</span>
          <span className="v4-num font-semibold text-ink">${money}k</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-paper md:h-3" data-money={fund}>
          <span
            className="block h-full rounded-full"
            style={{ width: `${(money / MONEY_MAX) * 100}%`, background: s.strong, transition: reduced ? "none" : "width 900ms cubic-bezier(.22,1,.36,1)" }}
          />
        </div>
      </div>
    </div>
  );
}

function Coins({ beat, n }: { beat: number; n: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[14px] h-0 md:bottom-[26px]">
      {Array.from({ length: n }, (_, i) => (
        <motion.span
          key={`${beat}-${i}`}
          className="absolute top-0 grid size-3 place-items-center rounded-full bg-[color-mix(in_oklab,var(--gold)_55%,var(--lime))] shadow-[0_0_0_2px_var(--paper),0_4px_10px_-2px_color-mix(in_oklab,var(--gold)_70%,transparent)] md:size-4"
          initial={{ left: "74%", y: 0, opacity: 0, scale: 0.4 }}
          animate={{ left: ["74%", "50%", "24%"], y: [0, -70 - (i % 4) * 16, 0], opacity: [0, 1, 1, 0], scale: [0.4, 1, 0.7] }}
          transition={{ duration: 1.25, delay: i * 0.07, ease: "easeInOut" }}
        >
          <span className="size-1 rounded-full bg-paper/80 md:size-1.5" />
        </motion.span>
      ))}
    </div>
  );
}

export function RepStory() {
  const frames = useMemo(() => runStory(), []);
  const reduced = useReducedMotionSafe();
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const [beat, setBeat] = useState(0);
  const [burst, setBurst] = useState(0);
  const prev = useRef(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const b = Math.max(0, Math.min(frames.length - 1, Math.floor(((p - 0.03) / 0.9) * frames.length)));
    if (b === prev.current) return;
    const lost = (MONEY.manipulator[prev.current] ?? 0) - (MONEY.manipulator[b] ?? 0);
    if (b > prev.current && lost > 0) setBurst((x) => x + 1);
    prev.current = b;
    setBeat(b);
  });
  const f = frames[beat]!;
  const moneyLost = beat > 0 ? (MONEY.manipulator[beat - 1] ?? 0) - (MONEY.manipulator[beat] ?? 0) : 0;
  const coins = Math.min(16, Math.max(0, Math.round(moneyLost / 5)));

  return (
    <div ref={track} className="relative mt-10 h-[calc(230vh/var(--v4-z,1))] md:mt-14">
      <div className="sticky top-[max(96px,calc(50vh/var(--v4-z,1)-330px))] md:top-[max(104px,calc(50vh/var(--v4-z,1)-350px))]">
        <div className="relative mx-auto max-w-[1040px] rounded-[28px] bg-paper p-2 shadow-[0_0_0_1px_var(--line),var(--v4-shadow-card)] md:p-3">
          <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
            <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3 text-[11.5px] font-medium text-paper shadow-[0_8px_20px_-10px_rgba(15,17,23,0.6)]">
              <span className="size-1.5 rounded-full bg-[var(--lime)]" />
              Example, scored with the real rules
            </span>
          </div>
          <div className="relative grid grid-cols-2 gap-2 md:gap-3">
            <Column fund="steady" beat={beat} score={f.scores.steady} changes={f.changes} reduced={reduced} />
            <Column fund="manipulator" beat={beat} score={f.scores.manipulator} changes={f.changes} reduced={reduced} />
            {!reduced && coins > 0 ? <Coins key={burst} beat={burst} n={coins} /> : null}
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 hidden size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-paper text-[11px] font-semibold text-ink-3 shadow-[0_0_0_1px_var(--line)] md:grid md:size-11 md:text-[12px]">
              vs
            </span>
          </div>
        </div>
        <div className="mx-auto mt-4 flex max-w-[820px] flex-col items-center gap-2.5 px-2 text-center md:mt-5">
          <div className="flex items-center gap-1.5" aria-hidden>
            {frames.map((fr, i) => (
              <span
                key={fr.key}
                className={cn("h-1.5 rounded-full transition-all duration-300", i === beat ? "w-6 bg-ink" : i < beat ? "w-1.5 bg-[color-mix(in_oklab,var(--ink)_45%,transparent)]" : "w-1.5 bg-[color-mix(in_oklab,var(--ink)_14%,transparent)]")}
              />
            ))}
          </div>
          <div className="relative min-h-[44px] w-full md:min-h-[26px]" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={f.key}
                className="text-[13.5px] leading-[21px] text-ink-2 md:text-[15px] md:leading-[24px]"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
              >
                <span className="font-semibold text-ink">{f.chip}.</span> {f.caption}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

