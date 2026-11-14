"use client";

import { useEffect, useRef, useState } from "react";
import { EASE } from "../motion";

export function resample(values: number[], length: number): number[] {
  if (length <= 0) return [];
  if (values.length === 0) return new Array(length).fill(0);
  if (values.length === length) return values.slice();
  if (values.length === 1) return new Array(length).fill(values[0]);
  const out = new Array<number>(length);
  for (let i = 0; i < length; i++) {
    const x = (i / Math.max(1, length - 1)) * (values.length - 1);
    const lo = Math.floor(x);
    const hi = Math.min(values.length - 1, lo + 1);
    out[i] = values[lo] + (values[hi] - values[lo]) * (x - lo);
  }
  return out;
}

function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const dx = sampleX(t) - x;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(dx) < 1e-4 || d === 0) break;
      t -= dx / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

export const ease = cubicBezier(EASE[0], EASE[1], EASE[2], EASE[3]);

export function useMorph(target: number[], duration = 300, disabled = false): number[] {
  const [current, setCurrent] = useState(target);
  const shownRef = useRef(target);
  const key = target.join(",");

  useEffect(() => {
    const to = target;
    const from = disabled ? to : resample(shownRef.current, to.length);

    if (from.length === to.length && from.every((v, i) => v === to[i])) {
      shownRef.current = to;
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = disabled ? 1 : Math.min(1, (now - start) / duration);
      const e = ease(p);
      const next = to.map((v, i) => from[i] + (v - from[i]) * e);
      shownRef.current = next;
      setCurrent(next);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);

  }, [key, duration, disabled]);

  return current.length === target.length ? current : target;
}
