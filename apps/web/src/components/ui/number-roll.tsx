"use client";

import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { parseShown, reelSteps } from "@/lib/number-roll";

export const ROLL_EASE = [0.12, 0.8, 0.16, 1] as const;
const STRIP = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const isDigit = (c: string) => c >= "0" && c <= "9";

type Dir = 1 | -1;

function Reel({
  digit,
  dir,
  delay,
  duration,
  rollIn,
}: {
  digit: number;
  dir: Dir;
  delay: number;
  duration: number;

  rollIn: boolean;
}) {

  const start = rollIn ? 0 : digit;
  const target = useRef(start);
  const want = useRef(rollIn ? -1 : digit);
  const pos = useMotionValue(start);
  const y = useTransform(pos, (v) => `${-((((v % 10) + 10) % 10) * 100) / STRIP.length}%`);

  useEffect(() => {
    if (want.current !== digit) {
      const from = ((target.current % 10) + 10) % 10;
      target.current += reelSteps(from, digit, dir, 0);
      want.current = digit;
    }

    if (pos.get() === target.current) return;
    const ctl = animate(pos, target.current, { duration: duration / 1000, delay: delay / 1000, ease: ROLL_EASE });
    return () => ctl.stop();

  }, [digit]);

  return (

    <span className="relative inline-block w-[1ch] text-center [clip-path:inset(0)]" aria-hidden>
      <span className="invisible">0</span>
      <motion.span className="absolute inset-x-0 top-0 flex flex-col will-change-transform" style={{ y }}>
        {STRIP.map((x, i) => (
          <span key={i} className="block h-[1lh]">
            {x}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export function NumberRoll({
  value,
  className,
  duration = 600,
  rollOnMount = false,
  label,
  direction = "auto",
}: {

  value: string;
  className?: string;

  duration?: number;

  rollOnMount?: boolean;

  label?: string;

  direction?: "auto" | "up" | "down";
}) {
  const reduce = useReducedMotion();

  const [seen, setSeen] = useState({ value, before: value, changed: false });
  if (seen.value !== value) setSeen({ value, before: seen.value, changed: true });
  const mounted = seen.changed;
  const before = seen.value !== value ? seen.value : seen.before;

  let dir: Dir = 1;
  if (direction === "down") dir = -1;
  else if (direction === "auto" && mounted) {
    const a = parseShown(before);
    const b = parseShown(value);
    if (Number.isFinite(a) && Number.isFinite(b) && b < a) dir = -1;
  }

  if (reduce) {
    return (
      <span className={cn("num relative inline-grid whitespace-nowrap [&>*]:[grid-area:1/1]", className)}>
        <span className="sr-only">{label ?? value}</span>
        <AnimatePresence initial={false}>
          <motion.span
            key={value}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "linear" }}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
    );
  }

  const chars = value.split("");
  const old = before.split("");
  const n = chars.length;
  const stagger = duration <= 300 ? 0 : 40;

  let order = 0;
  const delays = chars.map((c, i) => {
    if (!isDigit(c)) return 0;
    const fromRight = n - i;
    const was = old[old.length - fromRight];
    const moving = !mounted ? rollOnMount : was !== c;
    return moving ? order++ * stagger : 0;
  });

  return (
    <span className={cn("num inline-flex whitespace-nowrap", className)}>
      <span className="sr-only">{label ?? value}</span>
      {chars.map((c, i) => {
        const fromRight = n - i;
        if (isDigit(c)) {
          return (
            <Reel
              key={`d${fromRight}`}
              digit={Number(c)}
              dir={dir}
              delay={delays[i]}
              duration={duration}

              rollIn={mounted || rollOnMount}
            />
          );
        }
        return (
          <span key={`c${fromRight}-${c}`} aria-hidden>
            {c}
          </span>
        );
      })}
    </span>
  );
}
