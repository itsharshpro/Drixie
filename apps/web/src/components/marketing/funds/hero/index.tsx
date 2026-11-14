"use client";

import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Eyebrow, MagneticButton, Stage, WordReveal, useReducedMotionSafe } from "../../v4/primitives";
import { useTerminalLayout } from "../../v4/primitives/use-layout";
import { useFunds, useNewestMove, useSeason } from "../data/queries";
import { NextBellCard, RevealCard } from "./cards";
import { ArenaTerminal } from "./terminal";

function Floater({ children, className, rise, mx, my, depth, bobDelay }: {
  children: ReactNode;
  className: string;
  rise: MotionValue<number>;
  mx: MotionValue<number>;
  my: MotionValue<number>;
  depth: number;
  bobDelay: string;
}) {
  const x = useTransform(mx, (v) => v * depth);
  const y = useTransform(my, (v) => v * depth * 0.8);
  return (
    <motion.div className={`pointer-events-auto absolute z-20 ${className}`} style={{ y: rise }}>
      <motion.div style={{ x, y }}>
        <div className="v4-bob" style={{ animationDelay: bobDelay }}>
          <div className="v4-pop-in">{children}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="text-brand">
      <circle cx="7" cy="7" r="6.25" fill="color-mix(in oklab, var(--brand) 10%, transparent)" />
      <path d="M4.3 7.1 6.2 9 9.8 5.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeroCopy() {
  const { status } = useFunds();
  const label =
    status === "offline" ? "Five AI fund managers · Offline" : status === "waiting" ? "Five AI fund managers · Opening soon" : "Live · Five AI fund managers";
  return (
    <div className="flex flex-col items-center text-center">
      <div className="v4-hero-in" style={{ "--d": "0ms" } as CSSProperties}>
        <Eyebrow live={status === "live" ? true : "off"} arrow href="#arena">
          {label}
        </Eyebrow>
      </div>
      <WordReveal as="h1" id="hero-title" play="load" delay={120} className="v4-h1 mt-6 max-w-[920px] md:mt-7" text={["Back the AI fund manager", "you trust."]} />
      <p className="v4-body v4-hero-in mt-5 max-w-[580px] [text-wrap:balance] md:mt-6" style={{ "--d": "520ms" } as CSSProperties}>
        Five AI managers each run a 10-holding fund off real stock prices. Buy in at NAV or trade the fund coin, and watch every move land at the bell.
      </p>
      <div
        className="v4-hero-in mt-8 flex w-full max-w-[340px] flex-col items-stretch justify-center gap-3 min-[520px]:w-auto min-[520px]:max-w-none min-[520px]:flex-row min-[520px]:items-center"
        style={{ "--d": "640ms" } as CSSProperties}
      >
        <MagneticButton href="/app" variant="royal">
          See the five funds
        </MagneticButton>
        <MagneticButton href="/app/start" variant="outline" arrow={false}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="text-brand">
            <path d="M2.5 11.5a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 11.5 10.6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="8" cy="11.5" r="1.3" fill="currentColor" />
          </svg>
          Find your fund
        </MagneticButton>
      </div>
      <ul className="v4-hero-in mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-ink-2" style={{ "--d": "760ms" } as CSSProperties}>
        {["Passkey sign-in", "No wallet", "Real market prices"].map((t) => (
          <li key={t} className="flex items-center gap-1.5 whitespace-nowrap">
            <Check />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FundsHero() {
  const reduced = useReducedMotionSafe();
  const layout = useTerminalLayout();
  const mobile = layout === "mobile";
  const { nextBellAt, status } = useFunds();
  const live = status === "live";
  const season = useSeason(live);
  const bellSecs = season.data?.clock?.bellSecs ?? 900;
  const move = useNewestMove(live);

  const { scrollY } = useScroll();
  const span = mobile ? 360 : 520;
  const raw = useTransform(scrollY, [0, span], [0, 1], { clamp: true });
  const p = useSpring(raw, { stiffness: 140, damping: 26, mass: 0.35 });
  const ty = useTransform(p, [0, 1], reduced ? [0, 0] : [mobile ? 64 : 120, 0]);
  const scale = useTransform(p, [0, 1], reduced ? [1, 1] : [mobile ? 0.96 : 0.92, 1]);
  const rotateX = useTransform(p, [0, 1], reduced ? [0, 0] : [mobile ? 8 : 14, 0]);
  const riseA = useTransform(p, [0, 1], reduced ? [0, 0] : [mobile ? 40 : 80, 0]);
  const riseB = useTransform(p, [0, 1], reduced ? [0, 0] : [mobile ? 40 : 56, 0]);

  const mxRaw = useMotionValue(0);
  const myRaw = useMotionValue(0);
  const mx = useSpring(mxRaw, { stiffness: 90, damping: 18, mass: 0.6 });
  const my = useSpring(myRaw, { stiffness: 90, damping: 18, mass: 0.6 });
  const box = useRef<HTMLElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType !== "mouse" || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const spot = spotRef.current;
    if (spot) {
      const sr = spot.getBoundingClientRect();
      spot.style.setProperty("--sx", `${e.clientX - sr.left}px`);
      spot.style.setProperty("--sy", `${e.clientY - sr.top}px`);
    }
    mxRaw.set(((e.clientX - r.left) / r.width) * 2 - 1);
    myRaw.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };

  return (
    <section
      ref={box}
      id="top"
      aria-labelledby="hero-title"
      onPointerMove={onMove}
      onPointerEnter={(e) => e.pointerType === "mouse" && !reduced && spotRef.current?.setAttribute("data-on", "")}
      onPointerLeave={() => {
        mxRaw.set(0);
        myRaw.set(0);
        spotRef.current?.removeAttribute("data-on");
      }}
      className="v4-hero relative px-2.5 pt-2.5 md:px-4 md:pt-4"
    >
      <Stage bleed="var(--hero-bleed)" archTop="var(--hero-arch)" archDepth={mobile ? 220 : 340} className="mx-auto max-w-[1408px]">
        <div
          ref={spotRef}
          data-art
          aria-hidden
          className="v4-spotlight pointer-events-none absolute inset-x-0 top-0 overflow-hidden rounded-[24px] md:rounded-[32px]"
          style={{ bottom: "var(--hero-bleed)" }}
        >
          <span className="v4-cross-h" />
          <span className="v4-cross-v" />
        </div>
        <div className="px-4 pt-[112px] md:pt-[136px] xl:pt-[152px]">
          <HeroCopy />
        </div>

        <div id="arena" className="v4-hero-window relative mx-auto mt-12 w-[calc(100%-24px)] max-w-[1080px] scroll-mt-24 md:mt-16 md:w-[92%]" style={{ perspective: 1600 } as CSSProperties}>
          <motion.div className="v4-hero-in relative" style={{ y: ty, scale, rotateX, transformOrigin: "50% 0%", "--d": "380ms" } as never}>
            <ArenaTerminal />
          </motion.div>

          {nextBellAt && live ? (
            <Floater
              className={mobile ? "-left-1 -top-9 origin-top-left scale-[0.85]" : "-left-3 -top-9 lg:-left-12 xl:-left-20"}
              rise={riseA}
              mx={mx}
              my={my}
              depth={-12}
              bobDelay="0s"
            >
              <NextBellCard nextBellAt={nextBellAt} bellSecs={bellSecs} />
            </Floater>
          ) : null}
          {move ? (
            <Floater
              className={mobile ? "-bottom-[92px] -right-1 origin-bottom-right scale-[0.85]" : "-bottom-[132px] -right-3 lg:-bottom-[88px] lg:-right-12 xl:-right-20"}
              rise={riseB}
              mx={mx}
              my={my}
              depth={mobile ? 0 : 14}
              bobDelay="-3s"
            >
              <RevealCard move={move} />
            </Floater>
          ) : null}
        </div>
      </Stage>
    </section>
  );
}
