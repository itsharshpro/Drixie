"use client";

import { FUND_IDS, FUND_SEEDS, type FeedItem, type FundRow } from "@listed/shared";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NumberRoll } from "@/components/ui/number-roll";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { useClock } from "../../lib/use-clock";
import { useInView, useReducedMotionSafe } from "../../v4/primitives";
import { useTerminalLayout } from "../../v4/primitives/use-layout";
import { backtestReturn, backtestSpark, fmtAgo, fmtCountdown, fmtPct, fmtPp, fmtUsd, fundColor, LIVE_MIN_POINTS, liveTooThin, mandateWord, secondsUntil, type BacktestInterval } from "../data/logic";
import { clockWords } from "@/lib/funds/format";
import { useFunds, useFundBacktest, useFundBacktests, useFundCandles, useFundsFeed, useArenaSeries, useSeason } from "../data/queries";
import { useFundsLive } from "../data/live";
import { BellGlyph, Change, FundMark, LiveDot, RepBadge, Spark } from "../ui/atoms";
import { toCandles } from "../ui/charts";
import { HeroCoinChart, type HeroInterval } from "../../v4/hero";
import { BacktestChart } from "./backtest-chart";

const CYCLE_MS = 7000;

function Chrome({ state, bell }: { state: "live" | "connecting" | "waiting" | "offline"; bell: number | null }) {
  const label = { live: "Live", connecting: "Connecting", waiting: "Opens at the first bell", offline: "Offline" }[state];
  return (
    <div className="relative flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
      <div className="flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-[10px] rounded-full bg-[color-mix(in_oklab,var(--ink)_12%,transparent)]" />
        ))}
      </div>
      <div className="absolute left-1/2 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-[8px] bg-fill px-3 text-[12px] text-ink-2">
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="text-ink-3">
          <rect x="2.5" y="5.2" width="7" height="5" rx="1.2" fill="currentColor" />
          <path d="M4 5.2V4a2 2 0 0 1 4 0v1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span className="font-medium text-ink">drixie</span>
        <span className="text-ink-3">·</span>
        <span>arena</span>
      </div>
      <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
        <LiveDot on={state === "live"} />
        <span className="hidden md:inline">{label}</span>
        {bell !== null ? <span className="v4-num hidden md:inline">· bell #{bell.toLocaleString("en-US")}</span> : null}
      </div>
    </div>
  );
}

export interface RailBacktest {
  ret: number;
  spark: number[];
}

function RailRow({ f, seed, bt, active, onPick, onHoverEnd, cycleMs, cycleKey }: {
  f: FundRow | null;
  bt: RailBacktest | null;
  seed: { id: string; name: string; mandate: string };
  active: boolean;
  onPick: (id: string, via: "hover" | "click") => void;
  onHoverEnd: () => void;
  cycleMs: number;
  cycleKey: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onPick(seed.id, "click")}
      onPointerEnter={(e) => e.pointerType === "mouse" && onPick(seed.id, "hover")}
      onPointerLeave={onHoverEnd}
      className="relative flex h-[68px] w-full items-center gap-3 px-4 text-left outline-none transition-colors duration-200 focus-visible:bg-fill"
    >
      {active ? (
        <motion.span
          layoutId="v4f-rail-active"
          className="absolute inset-x-2 inset-y-1 rounded-[12px]"
          style={{ background: `color-mix(in oklab, ${fundColor(seed.id)} 7%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${fundColor(seed.id)} 18%, transparent)` }}
          transition={{ type: "spring", stiffness: 480, damping: 40 }}
        />
      ) : null}
      <FundMark id={seed.id} size={32} className="relative" />
      <span className="relative flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{f?.name ?? seed.name}</span>
        <span className="truncate text-[12px] text-ink-3">{mandateWord(f?.mandate ?? seed.mandate)}</span>
      </span>
      {bt ? (
        <>
          <Spark id={seed.id} values={bt.spark} width={44} height={22} className="relative shrink-0" />
          <span className="relative flex flex-col items-end gap-0.5" title="Backtest: the basket on real prices since Nov 1">
            <span className={cn("v4-num text-[13.5px] font-medium", bt.ret >= 0 ? "text-up" : "text-down")}>{fmtPct(bt.ret)}</span>
            <span className="text-[10.5px] text-ink-3">since Nov 1</span>
          </span>
        </>
      ) : (
        <span className="relative flex flex-col items-end gap-0.5">
          <span className="v4-num text-[13.5px] font-medium text-ink">{f ? fmtUsd(f.nav) : "—"}</span>
          {f ? <Change value={f.ret1d} className="h-[18px] px-1.5 text-[10.5px]" /> : null}
        </span>
      )}
      {active && cycleMs > 0 ? (
        <span className="absolute inset-x-5 bottom-1.5 h-[2px] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ink)_6%,transparent)]" aria-hidden>
          <span key={cycleKey} className="block h-full origin-left rounded-full" style={{ background: fundColor(seed.id), animation: `v4-cycle ${cycleMs}ms linear both` }} />
        </span>
      ) : null}
    </button>
  );
}

function BellPanel({ nextBellAt, bellSecs }: { nextBellAt: string | null; bellSecs: number }) {
  const now = useClock();
  const left = secondsUntil(nextBellAt, now);
  const frac = left === null ? 0 : 1 - Math.min(1, left / bellSecs);
  const due = left !== null && left <= 5;
  return (
    <div className="rounded-[16px] bg-[color-mix(in_oklab,var(--gold)_7%,var(--paper))] p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--gold)_18%,transparent)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-gold-text">Next rebalance bell</span>
        <BellGlyph size={15} className="v4-bell-wobble text-gold" due={due} />
      </div>
      <div className="v4-num mt-2 text-[30px] font-medium leading-none tracking-[-0.03em] text-ink" aria-live="off">
        {left === null ? <span className="text-[20px] text-ink-2">{clockWords({ bellSecs }).everyShort}</span> : <NumberRoll value={fmtCountdown(left)} duration={500} rollOnMount={false} label={`${left} seconds`} />}
      </div>
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[var(--gold-soft)]" aria-hidden>
        <div className="h-full rounded-full bg-gold" style={{ width: `${(frac * 100).toFixed(1)}%`, transition: "width 1s linear" }} />
      </div>
      <p className="mt-2.5 text-[12px] leading-4 text-ink-2">All five funds reveal their moves together.</p>
    </div>
  );
}

function MovesFeed({ items, limit }: { items: FeedItem[]; limit: number }) {
  const now = useClock();
  const shown = items.slice(0, limit);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Live moves</span>
        <LiveDot on={shown.length > 0} />
      </div>
      {shown.length ? (
        <ul className="mt-2 flex flex-col gap-1">
          {shown.map((it, i) => (
            <motion.li
              key={it.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="flex gap-2.5 rounded-[12px] p-2 hover:bg-fill"
            >
              {it.fund ? <FundMark id={it.fund} size={24} /> : <span className="size-6 shrink-0 rounded-[6px] bg-fill" />}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[12.5px] leading-[17px] text-ink">{it.title}</span>
                <span className="mt-0.5 block text-[11px] text-ink-3">{fmtAgo(it.at, now)}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 px-1 text-[12.5px] leading-[18px] text-ink-3">Moves land here the moment the funds reveal at the bell.</p>
      )}
    </div>
  );
}

function CentreEmpty({ offline }: { offline: boolean }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="flex max-w-[380px] flex-col items-center">
        <div className="flex -space-x-2" aria-hidden>
          {FUND_IDS.map((id, i) => (
            <span key={id} className="rounded-[10px] bg-paper" style={{ transform: `translateY(${Math.abs(i - 2) * 3}px)` }}>
              <FundMark id={id} size={40} lift />
            </span>
          ))}
        </div>
        <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.02em] text-ink">{offline ? "The arena is offline" : "The arena opens at the first bell"}</h3>
        <p className="mt-1.5 text-[13.5px] leading-5 text-ink-2">
          {offline
            ? "Drixie isn't reachable right now. NAV lines, coin candles and moves show up here the moment it is."
            : "The five managers are set. NAV lines, coin candles and their moves appear here when the first NAV is posted."}
        </p>
        <Link href="/app" className="mt-4 inline-flex h-11 items-center text-[13px] font-medium text-brand hover:underline">
          See the five funds
        </Link>
      </div>
    </div>
  );
}

export function ArenaTerminal() {
  const layout = useTerminalLayout();
  const reduced = useReducedMotionSafe();
  const { funds, status, nextBellAt, data } = useFunds();
  const { connected } = useFundsLive();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "0px" });
  const arrived = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });

  const live = status === "live";
  const ids = useMemo(() => funds.map((f) => f.id), [funds]);
  const { series, spy, loading: navLoading } = useArenaSeries(ids, "1D", live && arrived);
  const feed = useFundsFeed(6, live && arrived);
  const season = useSeason(live);

  const [picked, setPicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [autoIdx, setAutoIdx] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const [pointerIn, setPointerIn] = useState(false);
  const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(dwell.current), []);

  const rows = live ? funds : [];
  const autoplay = !reduced && live && picked === null && rows.length > 1;
  const paused = !inView || pointerIn || hovered !== null;
  useEffect(() => {
    if (!autoplay || paused) return;
    const id = setTimeout(() => {
      setAutoIdx((i) => (i + 1) % Math.max(1, rows.length));
      setCycleKey((k) => k + 1);
    }, CYCLE_MS);
    return () => clearTimeout(id);
  }, [autoplay, paused, cycleKey, rows.length]);

  const onPick = useCallback((id: string, via: "hover" | "click") => {
    clearTimeout(dwell.current);
    if (via === "click") return setPicked(id);
    setHovered(id);
    dwell.current = setTimeout(() => setPicked(id), 110);
  }, []);
  const onHoverEnd = useCallback(() => {
    clearTimeout(dwell.current);
    setHovered(null);
    setCycleKey((k) => k + 1);
  }, []);

  const selectedId = picked ?? rows[autoIdx % Math.max(1, rows.length)]?.id ?? null;
  const fund = rows.find((f) => f.id === selectedId) ?? rows[0] ?? null;
  const [interval, setInterval_] = useState<HeroInterval>("5m");
  const apiInterval = interval === "1h" ? "1h" : interval === "15m" ? "15m" : "5m";
  const candlesQ = useFundCandles(fund?.id ?? null, apiInterval, live && arrived);
  const candles = useMemo(() => toCandles(candlesQ.data?.candles, apiInterval), [candlesQ.data, apiInterval]);

  const live5m = useFundCandles(fund?.id ?? null, "5m", live && arrived);
  const liveCount = live5m.data?.candles.length ?? 0;
  const [btInterval, setBtInterval] = useState<BacktestInterval>("1h");
  const btQ = useFundBacktest(fund?.id ?? null, btInterval, live && arrived);
  const btMode = !live5m.isLoading && liveCount < LIVE_MIN_POINTS && !btQ.isError && (btQ.isLoading || (btQ.data?.candles.length ?? 0) > 0);

  const [lineRef] = useElementSize<HTMLDivElement>();
  const desktop = layout === "desktop";
  const mobile = layout === "mobile";

  const lineH = desktop ? 196 : layout === "tablet" ? 176 : 136;
  const candleH = desktop ? 188 : layout === "tablet" ? 164 : 118;
  const bellSecs = season.data?.clock?.bellSecs ?? 900;
  const chrome = status === "offline" ? "offline" : status === "waiting" ? "waiting" : live && connected ? "live" : "connecting";
  const seeds = FUND_IDS.map((id) => ({ id, name: FUND_SEEDS[id].name, mandate: FUND_SEEDS[id].mandate }));
  const railSeeds = live ? rows.map((f) => ({ id: f.id, name: f.name, mandate: f.mandate })) : seeds;
  const railIds = railSeeds.map((s) => s.id);
  const railBacktests = useFundBacktests(railIds, "1h", arrived && status !== "loading" && status !== "offline");
  const railBt = new Map<string, RailBacktest>();
  railIds.forEach((id, i) => {
    const bt = railBacktests[i];
    const ret = backtestReturn(bt);
    if (bt && ret !== null && liveTooThin(funds.find((r) => r.id === id)?.spark)) railBt.set(id, { ret, spark: backtestSpark(bt, 40) });
  });
  const railAllBt = railBt.size > 0 && railBt.size === railIds.length;

  const rail = !mobile ? (
    <div className="flex w-[248px] shrink-0 flex-col border-r border-line">
      <div className="flex h-10 items-center justify-between px-5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
        <span>Five funds</span>
        <span>{railAllBt ? "Since Nov 1" : "NAV · 1d"}</span>
      </div>
      <div className="flex flex-col" role="group" aria-label="Funds">
        {status === "loading"
          ? seeds.map((s) => (
              <div key={s.id} className="flex h-[68px] items-center gap-3 px-4">
                <span className="v4-skel size-8 rounded-[8px]" />
                <span className="flex flex-1 flex-col gap-1.5">
                  <span className="v4-skel h-3 w-20 rounded" />
                  <span className="v4-skel h-2.5 w-14 rounded" />
                </span>
              </div>
            ))
          : railSeeds.map((s) => (
              <RailRow
                key={s.id}
                seed={s}
                f={rows.find((r) => r.id === s.id) ?? null}
                bt={railBt.get(s.id) ?? null}
                active={!!fund && fund.id === s.id}
                onPick={live ? onPick : () => undefined}
                onHoverEnd={onHoverEnd}
                cycleMs={autoplay && !paused ? CYCLE_MS : 0}
                cycleKey={cycleKey}
              />
            ))}
      </div>
      {desktop ? (
        <div className="mt-auto border-t border-line px-5 py-3 text-[11.5px] text-ink-3">
          {data?.spySeason !== null && data?.spySeason !== undefined ? (
            <span>
              SPY this season <span className="v4-num text-ink-2">{data.spySeason >= 0 ? "+" : "−"}{Math.abs(data.spySeason).toFixed(1)}%</span>
            </span>
          ) : (
            <span>Benchmark: SPY</span>
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  let centre: React.ReactNode;
  if (status === "loading") {
    centre = (
      <div className="flex h-full flex-col gap-3 p-5" aria-busy>
        <span className="v4-skel h-10 w-56 rounded-[10px]" />
        <span className="v4-skel flex-1 rounded-[14px]" />
        <span className="v4-skel h-28 rounded-[14px]" />
      </div>
    );
  } else if (!fund) {
    centre = <CentreEmpty offline={status === "offline"} />;
  } else {
    centre = (
      <div className="flex h-full min-h-0 flex-col">
        {mobile ? (
          <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pt-3 [scrollbar-width:none]" role="group" aria-label="Funds">
            {rows.map((f) => {
              const on = f.id === fund.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(f.id, "click")}
                  className={cn("relative flex h-11 shrink-0 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-[12.5px] font-medium", on ? "text-ink" : "text-ink-2")}
                >
                  <span
                    className="absolute inset-0 rounded-full transition-shadow duration-200"
                    style={{ boxShadow: on ? `inset 0 0 0 1px color-mix(in oklab, ${fundColor(f.id)} 35%, transparent)` : "inset 0 0 0 1px var(--line)", background: on ? `color-mix(in oklab, ${fundColor(f.id)} 7%, transparent)` : undefined }}
                  />
                  <FundMark id={f.id} size={24} className="relative" />
                  <span className="relative">{f.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-3 md:px-5 md:pt-4">
          <div className="flex min-w-0 items-center gap-3">
            {!mobile ? <FundMark id={fund.id} size={40} /> : null}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[16px] font-semibold tracking-[-0.015em] text-ink">{fund.name}</span>
                <RepBadge score={fund.reputation} />
              </div>
              <div className="truncate text-[12.5px] text-ink-3">{fund.mandateLine}</div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="v4-num text-[22px] font-medium leading-7 tracking-[-0.02em] text-ink md:text-[26px] md:leading-8">
              <NumberRoll value={fmtUsd(fund.nav)} duration={700} label={`NAV ${fmtUsd(fund.nav)}`} />
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ink-3">
              <span className="hidden md:inline">NAV ·</span> vs SPY <span className={cn("v4-num font-medium", (fund.vsSpy ?? 0) >= 0 ? "text-up" : "text-down")}>{fmtPp(fund.vsSpy)}</span>
            </span>
          </div>
        </div>
        <div ref={lineRef} className="min-h-0 flex-1 px-2 pb-2 md:px-3">
          {btMode ? (
            <BacktestChart
              fundId={fund.id}
              fundName={fund.name}
              backtest={btQ.data ?? null}
              interval={btInterval}
              onInterval={setBtInterval}
              height={lineH + candleH}
              loading={btQ.isLoading}
            />
          ) : (
          <HeroCoinChart
            fundId={fund.id}
            fundName={fund.name}
            candles={candles}
            interval={interval}
            onInterval={setInterval_}
            height={lineH + candleH}
            loading={candlesQ.isLoading || navLoading}
            coinPrice={fund.coinPrice}
            premium={fund.premium}
            nav={series.find((s) => s.id === fund.id) ?? null}
            spy={spy ?? null}
          />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onPointerEnter={(e) => e.pointerType === "mouse" && setPointerIn(true)}
      onPointerLeave={() => setPointerIn(false)}
      className="v4-terminal flex flex-col overflow-hidden rounded-[20px] bg-paper"
      role="region"
      aria-label="Live Drixie arena"
    >
      <Chrome state={chrome} bell={data?.lastBell ?? null} />
      <div className="flex min-h-0 flex-1">
        {rail}
        <div className="min-w-0 flex-1">{centre}</div>
        {desktop ? (
          <div className="flex w-[252px] shrink-0 flex-col gap-3 border-l border-line p-3">
            <BellPanel nextBellAt={nextBellAt} bellSecs={bellSecs} />
            <MovesFeed items={feed.data?.items ?? []} limit={3} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
