"use client";

import { FUND_STREAM_TOPICS, type FundStreamEvent } from "@listed/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { API_BASE } from "../../lib/api";
import { FK, useFunds } from "./queries";

interface LiveState {
  connected: boolean;

  bells: number;
}

const LiveCtx = createContext<LiveState>({ connected: false, bells: 0 });

export function useFundsLive(): LiveState {
  return useContext(LiveCtx);
}

const THROTTLE_MS = 2500;

export function FundsLive({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { status } = useFunds();
  const [connected, setConnected] = useState(false);
  const [bells, setBells] = useState(0);
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (status !== "live" || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    const queued = pending.current;

    const flush = () => {
      timer.current = undefined;
      const keys = [...queued];
      queued.clear();
      for (const k of keys) {
        const key =
          k === "list" ? FK.list() : k === "feed" ? FK.feed() : k.startsWith("detail:") ? FK.detail(k.slice(7)) : k.startsWith("moves:") ? FK.moves(k.slice(6)) : null;
        if (key) void qc.invalidateQueries({ queryKey: key });
        if (k === "nav") void qc.invalidateQueries({ queryKey: [...FK.all, "nav"] });
        if (k === "candles") void qc.invalidateQueries({ queryKey: [...FK.all, "candles"] });
      }
    };
    const mark = (...keys: string[]) => {
      for (const k of keys) queued.add(k);
      if (!timer.current) timer.current = setTimeout(flush, THROTTLE_MS);
    };

    const onEvent = (raw: MessageEvent<string>) => {
      let ev: FundStreamEvent | null = null;
      try {
        ev = JSON.parse(raw.data) as FundStreamEvent;
      } catch {
        return;
      }
      if (!ev || typeof ev !== "object") return;
      switch (ev.topic) {
        case "bell":
          setBells((b) => b + 1);
          mark("list", "feed");
          break;
        case "nav":
          mark("list", "nav", "candles");
          break;
        case "move":
          mark("feed", `moves:${ev.move.fund}`, `detail:${ev.move.fund}`);
          break;
        case "trade":
          mark("list", "candles", "feed");
          break;
        case "reputation":
          mark("list", "feed");
          break;
      }
    };

    const open = () => {
      if (es) return;
      es = new EventSource(`${API_BASE}/funds/stream?topics=${encodeURIComponent(FUND_STREAM_TOPICS.join(","))}`);
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);
      for (const t of FUND_STREAM_TOPICS) es.addEventListener(t, onEvent as EventListener);
      es.onmessage = onEvent;
    };
    const close = () => {
      es?.close();
      es = null;
      setConnected(false);
    };
    const onVis = () => (document.visibilityState === "visible" ? open() : close());

    if (document.visibilityState === "visible") open();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      close();
      clearTimeout(timer.current);
      timer.current = undefined;
      queued.clear();
    };
  }, [status, qc]);

  const value = useMemo(() => ({ connected, bells }), [connected, bells]);
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}
