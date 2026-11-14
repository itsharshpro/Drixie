"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DUR, EASE } from "@/lib/motion";
import { NAV } from "../ui/transitions";

export interface HandoffInfo {
  title: string;
  accountId: string;
  isNew: boolean;
}

const HOLD_MS = 1300;
const HOLD_REDUCED_MS = 700;

export function Handoff({ info, next }: { info: HandoffInfo; next: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();

  useEffect(() => {
    router.prefetch(next);
    const t = setTimeout(() => router.replace(next, { transitionTypes: [...NAV.forward] }), reduce ? HOLD_REDUCED_MS : HOLD_MS);
    return () => clearTimeout(t);
  }, [router, next, reduce]);

  const draw = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 },
    animate: reduce ? { opacity: 1 } : { pathLength: 1, opacity: 1 },
    transition: { duration: reduce ? 0.15 : DUR.chart, ease: EASE, delay: reduce ? 0 : delay },
  });

  return (
    <div className="flex w-full flex-col items-center text-center" role="status" aria-live="polite">
      <svg width="64" height="64" viewBox="0 0 48 48" fill="none" aria-hidden className="mb-3">
        <motion.circle cx="24" cy="24" r="19" stroke="var(--ink)" strokeWidth={1.5} {...draw(0)} />
        <motion.path d="M15.5 24.5l6 6 11-12" stroke="var(--up)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...draw(0.28)} />
        <motion.circle
          cx="38"
          cy="10"
          r="2.5"
          fill="var(--brand)"
          initial={{ opacity: 0, scale: reduce ? 1 : 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DUR.standard, ease: EASE, delay: reduce ? 0 : 0.7 }}
        />
      </svg>
      <motion.h1
        className="text-title font-semibold tracking-[-0.015em]"
        initial={{ opacity: 0, y: reduce ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.emphasis, ease: EASE, delay: reduce ? 0 : 0.15 }}
      >
        {info.title}
      </motion.h1>
      <motion.p
        className="mt-2 max-w-80 text-body-sm text-ink-2"
        initial={{ opacity: 0, y: reduce ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.emphasis, ease: EASE, delay: reduce ? 0 : 0.3 }}
      >
        {info.isNew ? "Your account is live on NEAR. Network fees are on us." : "Your key is on this device, so you can trade right away."}
      </motion.p>
      <motion.code
        className="num mt-6 max-w-full truncate rounded-full bg-paper px-4 py-2 text-caption text-ink shadow-e1"
        initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DUR.emphasis, ease: EASE, delay: reduce ? 0 : 0.45 }}
      >
        {info.accountId}
      </motion.code>
      <motion.p
        className="mt-6 text-caption text-ink-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR.standard, delay: reduce ? 0 : 0.8 }}
      >
        {next === "/app" ? "Opening the market…" : "Taking you back…"}
      </motion.p>
    </div>
  );
}
