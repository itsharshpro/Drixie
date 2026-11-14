import type { Transition } from "motion/react";

export const EASE = [0.2, 0.8, 0.2, 1] as const;

export const DUR = {
  micro: 0.12,
  standard: 0.2,
  emphasis: 0.32,
  chart: 0.6,
  hero: 0.9,
} as const;

export const SPRING: Transition = { type: "spring", stiffness: 420, damping: 36 };
export const SHEET_SPRING: Transition = { type: "spring", stiffness: 420, damping: 40, mass: 0.9 };

export const fade: Transition = { duration: DUR.standard, ease: EASE };
