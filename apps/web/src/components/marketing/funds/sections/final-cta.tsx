"use client";

import type { FundRow } from "@listed/shared";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import Link from "next/link";
import type { PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow, MagneticButton, Section, Stage, WordReveal, useReducedMotionSafe } from "../../v4/primitives";
import { BACKTEST_LABEL, backtestSpark, fmtUsd, liveTooThin } from "../data/logic";
import { useFundBacktests, useFunds } from "../data/queries";
import { Change, FundMark, Spark } from "../ui/atoms";
import "../../v4/primitives/motion.css";

function Tile({ f, y, r, depth, index, mx, my, btSpark }: { f: FundRow; y: number; r: number; depth: number; index: number; mx: MotionValue<number>; my: MotionValue<number>; btSpark: number[] | null }) {
  const tx = useTransform(mx, (v) => v * depth * 8);
  const ty = useTransform(my, (v) => v * depth * 6);
  return (
    <motion.div
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 + Math.abs(index - 2) * 0.09 }}
    >
      <motion.div style={{ x: tx, y: ty }}>
        <div className="v4c-bob" style={{ animationDuration: `${6.5 + (index % 3) * 1.1}s`, animationDelay: `${-index * 1.3}s` }}>
          <Link
            href={`/app/f/${f.id}`}
            className="block rounded-[16px] bg-paper p-2.5 text-left outline-none transition-[transform,box-shadow] duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-brand md:p-3"
            style={{
              transform: `translateY(${y}px) rotate(${r}deg)`,
              boxShadow: "0 0 0 1px color-mix(in oklab, var(--ink) 6%, transparent), 0 24px 60px -20px color-mix(in oklab, var(--ink) 35%, transparent)",
            }}
            aria-label={`${f.name}, NAV ${fmtUsd(f.nav)}`}
          >
            <span className="flex items-center gap-2">
              <FundMark id={f.id} size={24} />
              <span className="truncate text-[13px] font-semibold text-ink">{f.name}</span>
            </span>
            <span className="mt-2 flex items-baseline justify-between gap-1.5">
              <span className="v4-num text-[14px] font-medium text-ink md:text-[15px]">{fmtUsd(f.nav)}</span>
              <Change value={f.ret1d} className="hidden h-5 px-1.5 text-[10px] lg:inline-flex" />
            </span>
            {btSpark ? (
              <span className="block" title={BACKTEST_LABEL}>
                <Spark id={f.id} values={btSpark} width={150} height={30} className="mt-1.5 w-full" />
                <span className="mt-0.5 block truncate text-[10px] text-ink-3">Backtest since Nov 1</span>
              </span>
            ) : (
              <Spark id={f.id} values={f.spark} width={150} height={30} className="mt-1.5 w-full" />
            )}
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function FundsFinalCta() {
  const { funds, status } = useFunds();
  const backtests = useFundBacktests(
    funds.map((f) => f.id),
    "1h",
    status === "live",
  );
  const btSpark = (f: FundRow, i: number): number[] | null => {
    const bt = backtests[i];
    return bt && liveTooThin(f.spark) ? backtestSpark(bt, 48) : null;
  };
  const reduced = useReducedMotionSafe();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const mx = useSpring(px, { stiffness: 70, damping: 18 });
  const my = useSpring(py, { stiffness: 70, damping: 18 });
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };
  const shown = status === "live" ? funds.slice(0, 5) : [];
  return (
    <Section id="start" aria-labelledby="start-title" edge="last">
      <Stage className="overflow-hidden rounded-[24px] md:rounded-[32px]" archTop="64%" archDepth={300} aria-labelledby="start-title">
        <div
          onPointerMove={onMove}
          onPointerLeave={() => {
            px.set(0);
            py.set(0);
          }}
          className={cn("flex flex-col items-center px-5 pb-14 pt-16 text-center md:px-8 md:pb-16 md:pt-20", shown.length ? "min-h-[520px]" : "min-h-[400px]")}
        >
          {status === "live" ? <Eyebrow live>Arena open</Eyebrow> : status === "offline" ? <Eyebrow live="off">Arena offline</Eyebrow> : <Eyebrow>Drixie</Eyebrow>}
          <WordReveal as="h2" id="start-title" className="v4-h2 mt-5 max-w-[680px]" text={["Pick a manager.", "Back them at the next bell."]} play="view" delay={60} />
          <div className="mt-8 flex w-full max-w-[340px] flex-col items-stretch gap-3 min-[520px]:w-auto min-[520px]:max-w-none min-[520px]:flex-row min-[520px]:items-center">
            <MagneticButton href="/app" variant="royal">
              See the five funds
            </MagneticButton>
            <MagneticButton href="/app/start" variant="outline" arrow={false}>
              Find your fund
            </MagneticButton>
          </div>
          <span className="mt-3 text-[13px] text-ink-3">Passkey sign-in · No wallet · Testnet coins</span>
          {shown.length ? (
            <ul className="mt-auto flex w-full items-start justify-center gap-2.5 pt-12 md:gap-3 lg:gap-4" aria-label="The five funds">
              {shown.map((f, i) => {
                const off = i - (shown.length - 1) / 2;
                const a = Math.abs(off);
                return (
                  <li key={f.id} className={cn("min-w-0 md:w-[132px] lg:w-[176px]", a <= 1 ? "w-[31%] max-w-[150px]" : "hidden md:block")}>
                    <Tile f={f} y={5 * a * a + 5 * a} r={off * 2} depth={1 + a * 0.5} index={i} mx={mx} my={my} btSpark={btSpark(f, funds.indexOf(f))} />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </Stage>
    </Section>
  );
}
