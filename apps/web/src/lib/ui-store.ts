"use client";

import { useSyncExternalStore } from "react";

interface UiState {
  paletteOpen: boolean;
  overlayOpen: boolean; // tablet sidebar overlay
  moreOpen: boolean; // phone "More" sheet
}

let state: UiState = { paletteOpen: false, overlayOpen: false, moreOpen: false };
const subs = new Set<() => void>();

export function setUi(patch: Partial<UiState>): void {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
}

const SERVER: UiState = { paletteOpen: false, overlayOpen: false, moreOpen: false };

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function useUi<T>(select: (s: UiState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(SERVER),
  );
}
