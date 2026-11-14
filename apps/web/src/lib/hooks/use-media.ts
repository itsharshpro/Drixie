"use client";
import { useCallback, useSyncExternalStore } from "react";

export function useMedia(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (fn: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", fn);
      return () => mql.removeEventListener("change", fn);
    },
    [query],
  );
  const get = useCallback(() => window.matchMedia(query).matches, [query]);
  const server = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(subscribe, get, server);
}

export const MQ = {
  phone: "(max-width: 767px)",
  tablet: "(min-width: 768px) and (max-width: 1023px)",
  desktop: "(min-width: 1024px)",
  touch: "(hover: none)",
} as const;

export const useIsPhone = () => useMedia(MQ.phone);
export const useIsDesktop = () => useMedia(MQ.desktop, true);
