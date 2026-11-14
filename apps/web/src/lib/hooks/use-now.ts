"use client";

import { useCallback, useSyncExternalStore } from "react";

type Sub = () => void;
const subs = new Map<number, Set<Sub>>();
const timers = new Map<number, ReturnType<typeof setInterval>>();
const snapshots = new Map<number, number>();

function subscribe(interval: number, fn: Sub): () => void {
  let set = subs.get(interval);
  if (!set) {
    set = new Set();
    subs.set(interval, set);
    snapshots.set(interval, Date.now());
    timers.set(
      interval,
      setInterval(() => {
        snapshots.set(interval, Date.now());
        subs.get(interval)?.forEach((s) => s());
      }, interval),
    );
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) {
      clearInterval(timers.get(interval));
      timers.delete(interval);
      subs.delete(interval);
      snapshots.delete(interval);
    }
  };
}

export function useNow(interval = 1000): number | null {

  const sub = useCallback((fn: Sub) => subscribe(interval, fn), [interval]);
  const snap = useCallback(() => getSnapshot(interval), [interval]);
  return useSyncExternalStore(sub, snap, getServerSnapshot);
}

function getServerSnapshot(): null {
  return null;
}

function getSnapshot(interval: number): number {
  let v = snapshots.get(interval);
  if (v === undefined) {
    v = Date.now();
    snapshots.set(interval, v);
  }
  return v;
}
