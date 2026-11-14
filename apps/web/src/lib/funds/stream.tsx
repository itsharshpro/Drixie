"use client";

import type { FundStreamEvent, FundStreamTopic, FundsResponse, Move, MovesPage, SeasonResponse } from "@listed/shared";
import { FUND_STREAM_TOPICS } from "@listed/shared";
import { useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fundsStreamUrl } from "./api";
import { fk } from "./queries";

export type FundStreamStatus = "connecting" | "live" | "offline";
type Listener = (e: FundStreamEvent) => void;

interface Ctx {
  status: FundStreamStatus;
  subscribe: (topic: FundStreamTopic | "*", fn: Listener) => () => void;
}

const FundStreamContext = createContext<Ctx | null>(null);

const STALE_MS = 60_000;
const COALESCE_MS = 1_500;

function makeInvalidator(qc: QueryClient) {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    for (const key of pending.values()) void qc.invalidateQueries({ queryKey: key });
    pending.clear();
  };
  return {
    add(key: QueryKey) {
      pending.set(JSON.stringify(key), key);
      timer ??= setTimeout(flush, COALESCE_MS);
    },
    dispose() {
      clearTimeout(timer);
      pending.clear();
    },
  };
}

function prependMove(qc: QueryClient, move: Move) {
  qc.setQueryData<InfiniteData<MovesPage, string | null>>(fk.moves(move.fund), (d) => {
    if (!d || !d.pages.length) return d;
    const [first, ...rest] = d.pages;
    if (first!.items.some((m) => m.id === move.id)) return d;
    return { ...d, pages: [{ ...first!, items: [move, ...first!.items].slice(0, 40) }, ...rest] };
  });
}

export function applyFundEvent(qc: QueryClient, e: FundStreamEvent, inv: { add: (k: QueryKey) => void }) {
  switch (e.topic) {
    case "bell": {
      qc.setQueryData<FundsResponse>(fk.funds(), (d) =>
        d ? { ...d, nextBellAt: e.nextBellAt, lastBell: e.bell, items: d.items.map((f) => ({ ...f, nextBellAt: e.nextBellAt })) } : d,
      );
      qc.setQueryData<SeasonResponse>(fk.season(), (d) =>
        d?.clock ? { ...d, clock: { ...d.clock, bell: e.bell, nextBellAt: e.nextBellAt, season: e.season, quarter: e.quarter } } : d,
      );
      inv.add(fk.season());
      return;
    }
    case "nav": {
      const byFund = new Map(e.navs.map((n) => [n.fund, n]));
      qc.setQueryData<FundsResponse>(fk.funds(), (d) =>
        d
          ? {
              ...d,
              lastBell: e.bell,
              items: d.items.map((f) => {
                const n = byFund.get(f.id);
                if (!n) return f;
                const premium = f.coinPrice !== null && n.nav > 0 ? (f.coinPrice / n.nav - 1) * 100 : f.premium;
                return { ...f, nav: n.nav, aum: n.valueUsd, premium, spark: [...f.spark, n.nav].slice(-48) };
              }),
            }
          : d,
      );
      inv.add(fk.funds());
      for (const n of e.navs) {
        inv.add(fk.fund(n.fund));
        inv.add(["drixie-funds", "fund", n.fund.toLowerCase(), "nav"]);
      }
      inv.add(["drixie-funds", "portfolio"]);
      inv.add(fk.season());
      return;
    }
    case "move": {
      prependMove(qc, e.move);
      inv.add(fk.fund(e.move.fund));
      inv.add(fk.feedAll());
      inv.add(fk.assets());
      return;
    }
    case "trade": {
      inv.add(fk.fund(e.fund));
      inv.add(fk.funds());
      inv.add(["drixie-funds", "fund", e.fund.toLowerCase(), "candles"]);
      inv.add(fk.feedAll());
      inv.add(["drixie-funds", "portfolio"]);
      return;
    }
    case "reputation": {
      inv.add(fk.reputation(e.event.fund));
      inv.add(fk.fund(e.event.fund));
      inv.add(fk.funds());
      inv.add(fk.feedAll());
      return;
    }
  }
}

export function FundStreamProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<FundStreamStatus>("connecting");
  const listeners = useRef(new Map<string, Set<Listener>>());
  const [ctx] = useState<Ctx>(() => ({
    status: "connecting",
    subscribe: (topic, fn) => {
      const set = listeners.current.get(topic) ?? new Set<Listener>();
      set.add(fn);
      listeners.current.set(topic, set);
      return () => {
        set.delete(fn);
      };
    },
  }));

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const inv = makeInvalidator(qc);
    let es: EventSource | null = null;
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stale: ReturnType<typeof setTimeout> | undefined;

    const emit = (e: FundStreamEvent) => {
      listeners.current.get(e.topic)?.forEach((fn) => fn(e));
      listeners.current.get("*")?.forEach((fn) => fn(e));
    };
    const armStale = () => {
      clearTimeout(stale);
      stale = setTimeout(() => {
        setStatus("offline");
        reconnect();
      }, STALE_MS);
    };
    const onMessage = (topic: FundStreamTopic) => (m: MessageEvent<string>) => {
      armStale();
      let data: FundStreamEvent;
      try {
        data = JSON.parse(m.data) as FundStreamEvent;
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;
      const evt = { ...data, topic } as FundStreamEvent;
      applyFundEvent(qc, evt, inv);
      emit(evt);
    };
    const connect = () => {
      if (closed) return;
      es = new EventSource(fundsStreamUrl(FUND_STREAM_TOPICS), { withCredentials: true });
      es.onopen = () => {
        attempt = 0;
        setStatus("live");
        armStale();
      };
      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) {
          setStatus("offline");
          reconnect();
        }
      };
      es.addEventListener("ping", armStale);
      for (const t of FUND_STREAM_TOPICS) es.addEventListener(t, onMessage(t) as EventListener);
    };
    const reconnect = () => {
      es?.close();
      es = null;
      clearTimeout(retry);
      retry = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempt++));
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      clearTimeout(stale);
      es?.close();
      inv.dispose();
    };
  }, [qc]);

  const value = useMemo(() => ({ subscribe: ctx.subscribe, status }), [ctx.subscribe, status]);
  return <FundStreamContext.Provider value={value}>{children}</FundStreamContext.Provider>;
}

export function useFundStreamStatus(): FundStreamStatus {
  return useContext(FundStreamContext)?.status ?? "offline";
}

export function useFundEvents(topic: FundStreamTopic | "*", fn: Listener): void {
  const subscribe = useContext(FundStreamContext)?.subscribe;
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!subscribe) return;
    return subscribe(topic, (e) => ref.current(e));
  }, [subscribe, topic]);
}
