"use client";

import { FUND_IDS, type FundRow, type Move } from "@listed/shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { NumberRoll } from "@/components/ui/number-roll";
import { cn } from "@/lib/cn";
import { useClock } from "../../lib/use-clock";
import { Eyebrow, Section, SectionTitle, useInView, useReducedMotionSafe } from "../../v4/primitives";
import { fmtBps, fmtCountdown, fmtUsd, fundColor, headlineDiffs, secondsUntil } from "../data/logic";
import { useClockWords, useFundCandles, useFunds, useNewestMove } from "../data/queries";
import { BellGlyph, FundMark } from "../ui/atoms";
import { CoinCandles, toCandles } from "../ui/charts";

const STEPS = [
  { k: "commit", n: "01", title: "Commit", body: "Before the bell, each manager seals its new weights with a hash. Nobody, not even the other managers, can see them." },
  { k: "bell", n: "02", title: "The bell", body: "{Every} the bell rings for all five funds at once. Moves made after it don't count." },
  { k: "reveal", n: "03", title: "Reveal", body: "Within three minutes each manager shows the weights that match its hash. The contract checks the caps: 10 holdings, at most 10% moved per holding, two swaps." },
  { k: "nav", n: "04", title: "NAV post", body: "The NAV oracle prices all ten holdings off real markets and posts the new NAV with a hash of every price, so anyone can check it." },
  { k: "coin", n: "05", title: "The coin reacts", body: "Queued buy-ins fill at the new NAV, and traders move the fund coin's price above or below it." },
] as const;

type StoryData = { funds: FundRow[]; move: Move | null; nextBellAt: string | null };

function Panel({ step, d }: { step: number; d: StoryData }) {
  const fund = d.move ? d.funds.find((f) => f.id === d.move!.fund) ?? null : d.funds[0] ?? null;
  const candlesQ = useFundCandles(step === 4 ? fund?.id ?? null : null, "5m", step === 4);
  const candles = useMemo(() => toCandles(candlesQ.data?.candles, "5m"), [candlesQ.data]);
  const now = useClock();
  const clock = useClockWords();

  if (step === 0) {
    return (
      <ul className="flex w-full flex-col gap-2">
        {FUND_IDS.map((id, i) => (
          <li key={id} className="v4f-seal flex items-center gap-3 rounded-[14px] bg-paper px-3 py-2.5 shadow-[0_0_0_1px_var(--line)]" style={{ "--i": i } as CSSProperties}>
            <FundMark id={id} size={32} />
            <span className="flex-1 text-[14px] font-medium capitalize text-ink">{id}</span>
            <span className="v4-num flex h-7 items-center gap-1.5 rounded-full bg-fill px-2.5 text-[11.5px] text-ink-2">
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="v4f-lock">
                <rect x="2.5" y="5.2" width="7" height="5" rx="1.2" fill="currentColor" />
                <path d="M4 5.2V4a2 2 0 0 1 4 0v1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              sealed
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (step === 1) {
    const left = secondsUntil(d.nextBellAt, now);
    const clockShort = clock.everyShort;
    return (
      <div className="flex flex-col items-center text-center">
        <span className="relative grid size-[120px] place-items-center">
          <span className="v4f-ring absolute inset-0 rounded-full" />
          <span className="v4f-ring absolute inset-0 rounded-full" style={{ animationDelay: "1.1s" }} />
          <span className="grid size-[88px] place-items-center rounded-full bg-paper shadow-[0_0_0_1px_color-mix(in_oklab,var(--gold)_25%,transparent),0_16px_40px_-16px_color-mix(in_oklab,var(--gold)_60%,transparent)]">
            <BellGlyph size={40} className="v4-bell-wobble text-gold" due />
          </span>
        </span>
        <div className="mt-5 text-[11px] font-medium uppercase tracking-[0.08em] text-gold-text">Next bell</div>
        <div className="v4-num mt-1 text-[34px] font-medium tracking-[-0.03em] text-ink">
          {left === null ? clockShort : <NumberRoll value={fmtCountdown(left)} duration={500} rollOnMount={false} label={`${left} seconds`} />}
        </div>
        <div className="mt-3 flex -space-x-1.5">
          {FUND_IDS.map((id) => (
            <span key={id} className="rounded-[8px] ring-2 ring-paper">
              <FundMark id={id} size={24} />
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (step === 2) {
    const diffs = d.move ? headlineDiffs(d.move, 5) : [];
    if (!d.move || !diffs.length) {
      return (
        <div className="flex w-full flex-col gap-2.5">
          {[72, 58, 44, 36, 28].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="v4-skel h-3 w-12 rounded" />
              <span className="h-3 rounded-full border border-dashed border-line-strong" style={{ width: `${w}%` }} />
            </div>
          ))}
          <p className="mt-2 text-center text-[13px] text-ink-3">The first reveal shows up here, weight by weight.</p>
        </div>
      );
    }
    const max = Math.max(...diffs.map((x) => Math.max(x.before, x.after)), 1);
    return (
      <div className="w-full">
        <div className="mb-3 flex items-center gap-2.5">
          <FundMark id={d.move.fund} size={32} />
          <div>
            <div className="text-[14px] font-semibold text-ink">{d.move.fundName}</div>
            <div className="text-[12px] text-ink-3">bell #{d.move.bell} · real reveal</div>
          </div>
        </div>
        <ul className="flex flex-col gap-2.5">
          {diffs.map((x, i) => (
            <li key={x.asset} className="grid grid-cols-[64px_1fr_56px] items-center gap-3">
              <span className="v4-num truncate text-[12px] font-medium text-ink">{x.asset}</span>
              <span className="relative h-3 rounded-full bg-fill">
                <span className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_oklab,var(--ink)_14%,transparent)]" style={{ width: `${(x.before / max) * 100}%` }} />
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: fundColor(d.move!.fund) }}
                  initial={{ width: `${(x.before / max) * 100}%` }}
                  animate={{ width: `${(x.after / max) * 100}%` }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
              <span className={cn("v4-num text-right text-[11.5px] font-medium", x.delta >= 0 ? "text-up" : "text-down")}>
                {x.delta >= 0 ? "+" : "−"}
                {fmtBps(Math.abs(x.delta))}
              </span>
            </li>
          ))}
        </ul>
        {d.move.note ? <p className="mt-4 line-clamp-2 text-[13px] leading-[19px] text-ink-2">“{d.move.note}”</p> : null}
      </div>
    );
  }
  if (step === 3) {
    return (
      <div className="flex flex-col items-center text-center">
        {fund ? <FundMark id={fund.id} size={40} /> : null}
        <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{fund ? `${fund.name} NAV per coin` : "NAV per coin"}</div>
        <div className="v4-num mt-1 text-[44px] font-medium leading-[52px] tracking-[-0.03em] text-ink">
          {fund ? <NumberRoll value={fmtUsd(fund.nav)} duration={900} label={fmtUsd(fund.nav)} /> : "$10.00"}
        </div>
        <div className="mt-4 whitespace-nowrap rounded-[12px] bg-fill px-3 py-2 font-mono text-[10.5px] text-ink-2 md:text-[12px]">
          V × (1 + Σ wᵢ·rᵢ) − costs − brain bill − fee
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 6.3 4.6 9 10 3" fill="none" stroke="var(--up)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {fund ? "Posted on-chain with a hash of every price" : "Every fund launches at $10.00"}
        </div>
      </div>
    );
  }
  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
          {fund ? <FundMark id={fund.id} size={24} /> : null}
          {fund ? `${fund.name} coin` : "Fund coin"}
        </span>
        {fund?.premium !== null && fund?.premium !== undefined ? (
          <span className={cn("v4-num rounded-full px-2 py-0.5 text-[11.5px] font-medium", fund.premium >= 0 ? "bg-up-soft text-up" : "bg-down-soft text-down")}>
            {fund.premium >= 0 ? "+" : "−"}
            {Math.abs(fund.premium).toFixed(1)}% vs NAV
          </span>
        ) : null}
      </div>
      <div className="rounded-[12px] bg-paper p-1 shadow-[0_0_0_1px_var(--line)]">
        <CoinCandles
          candles={candles}
          height={200}
          loading={candlesQ.isLoading && !!fund}
          label="Fund coin candles"
          watermark={fund?.name.toUpperCase()}
          empty={<span className="text-[12.5px] text-ink-3">Coin candles start with the first pool trade.</span>}
        />
      </div>
    </div>
  );
}

function Visual({ step, d, className }: { step: number; d: StoryData; className?: string }) {
  const reduced = useReducedMotionSafe();
  return (
    <div className={cn("relative overflow-hidden rounded-[24px] bg-[color-mix(in_oklab,var(--sky)_35%,#fff)] p-5 shadow-[0_0_0_1px_var(--line)] md:p-7", className)}>
      <span data-art aria-hidden className="v4f-dots pointer-events-none absolute inset-x-0 bottom-0 h-24" style={{ "--dot": "var(--brand)" } as CSSProperties} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className="relative flex h-full items-center justify-center"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(3px)" }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <Panel step={step} d={d} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StepText({ i, active }: { i: number; active: boolean }) {
  const s = STEPS[i]!;
  const clock = useClockWords();
  const body = s.body.replace("{Every}", clock.every.charAt(0).toUpperCase() + clock.every.slice(1));
  return (
    <div className={cn("transition-opacity duration-500", active ? "opacity-100" : "lg:opacity-35")}>
      <div className="flex items-center gap-3">
        <span className={cn("v4-num grid size-9 place-items-center rounded-full text-[12px] font-medium transition-colors duration-300", active ? "bg-ink text-paper" : "bg-paper text-ink-2 shadow-[0_0_0_1px_var(--line-strong)]")}>
          {s.n}
        </span>
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-ink md:text-[26px]">{s.title}</h3>
      </div>
      <p className="mt-3 max-w-[460px] text-[15.5px] leading-[25px] text-ink-2 md:text-[16.5px] md:leading-[27px]">{body}</p>
    </div>
  );
}

export function BellStoryFunds() {
  const box = useRef<HTMLDivElement>(null);
  const near = useInView(box, { margin: "300px 0px 300px 0px" });
  const { funds, status, nextBellAt } = useFunds();
  const move = useNewestMove(near && status === "live");
  const d: StoryData = { funds, move, nextBellAt };
  const clockLine = useClockWords().line;

  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <Section id="bell" aria-labelledby="bell-title">
      <div ref={box}>
        <SectionTitle
          id="bell-title"
          eyebrow="One rebalance bell"
          title={["Every move lands", "~at the same moment.~"]}
          sub="Managers can't peek at each other or change their minds after the bell. Here is one bell, step by step."
        />
        <div className="mt-12 grid gap-10 md:mt-16 lg:grid-cols-2 lg:gap-16">
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh/var(--v4-z,1)-230px)]">
              <Visual step={active} d={d} className="h-[460px]" />
              <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
                {STEPS.map((s, i) => (
                  <span key={s.k} className={cn("h-1.5 rounded-full transition-all duration-300", i === active ? "w-6 bg-ink" : "w-1.5 bg-[color-mix(in_oklab,var(--ink)_18%,transparent)]")} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-12 lg:gap-0">
            {STEPS.map((s, i) => (
              <div
                key={s.k}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                data-step={i}
                className="flex flex-col gap-6 lg:min-h-[calc(64vh/var(--v4-z,1))] lg:justify-center"
              >
                <StepText i={i} active={active === i} />
                <Visual step={i} d={d} className="min-h-[300px] lg:hidden" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex justify-center">
          <Eyebrow>{clockLine}</Eyebrow>
        </div>
      </div>
    </Section>
  );
}
