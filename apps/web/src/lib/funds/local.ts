"use client";

import type { RiskProfileId } from "@listed/shared";
import { useSyncExternalStore } from "react";

const PROFILE_KEY = "drixie:risk-profile:v1";
const PICK_KEY = "drixie:picked-fund:v1";

export interface SavedProfile {
  profile: RiskProfileId;
  label: string;

  funds: string[];
  at: string;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PROFILE_KEY || e.key === PICK_KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {

  }
  notify();
}

let profileRaw: string | null | undefined;
let profileParsed: SavedProfile | null = null;
function getProfile(): SavedProfile | null {
  const raw = read(PROFILE_KEY);
  if (raw === profileRaw) return profileParsed;
  profileRaw = raw;
  try {
    const v = raw ? (JSON.parse(raw) as SavedProfile) : null;
    profileParsed = v && typeof v.profile === "string" && Array.isArray(v.funds) ? v : null;
  } catch {
    profileParsed = null;
  }
  return profileParsed;
}

export function saveProfile(p: SavedProfile | null): void {
  write(PROFILE_KEY, p ? JSON.stringify(p) : null);
}

export function useSavedProfile(): SavedProfile | null {
  return useSyncExternalStore(subscribe, getProfile, () => null);
}

const getPick = () => read(PICK_KEY);
export function savePickedFund(id: string): void {
  if (read(PICK_KEY) === id) return;
  write(PICK_KEY, id);
}
export function usePickedFund(): string | null {
  return useSyncExternalStore(subscribe, getPick, () => null);
}
