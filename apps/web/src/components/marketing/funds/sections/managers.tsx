"use client";

import { FUND_IDS, FUND_SEEDS, type FundDetail, type FundRow, type SeedFundId } from "@listed/shared";
import Link from "next/link";
import { useRef, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { InView, Section, SectionTitle, useInView } from "../../v4/primitives";
import { fmtBps, fmtPp, fmtUsd, fmtUsdCompact, fundColor, fundPastel, mandateWord, repTone, tierForValue } from "../data/logic";
import { useFundDetails, useFunds } from "../data/queries";
import { BrainChip, FundMark, RepBadge } from "../ui/atoms";
import { HoldingsDonut } from "../ui/charts";

const MANDATE_LINE: Record<SeedFundId, string> = {
  atlas: "Large caps, banks and dividends. Slow and steady.",
  meridian: "A bit of everything, kept in balance.",
  nova: "AI, chips, big tech and startups.",
  orion: "Buys what has fallen and waits.",
  kite: "Startups and high beta. Big swings.",
};

function RepBar({ score }: { score: number | null }) {
  const t = repTone(score);
  const color = t === "red" ? "var(--candle-down)" : t === "amber" ? "var(--gold)" : t === "green" ? "var(--candle-up)" : "var(--line-strong)";
  return (
    <div className="relative h-[6px] w-full overflow-hidden rounded-full bg-fill" aria-hidden>
      <span className="absolute inset-y-0 left-[40%] w-px bg-[color-mix(in_oklab,var(--ink)_20%,transparent)]" />
      <span className="v4f-grow block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%`, background: color }} />
    </div>
  );
}

function ManagerCard({ id, row, detail, i }: { id: SeedFundId; row: FundRow | null; detail: FundDetail | null; i: number }) {
  const seed = FUND_SEEDS[id];
  const tier = row?.brainTier ?? tierForValue(seed.seedUsd);
  const top = [...(detail?.holdings ?? [])].sort((a, b) => b.bps - a.bps).slice(0, 2);
  return (
    <li className="v4-reveal min-w-[272px] snap-center min-[600px]:min-w-[288px] min-[1200px]:min-w-0" style={{ "--i": i } as CSSProperties}>
      <Link
        href={`/app/f/${id}`}
        className="v4f-card group flex h-full flex-col overflow-hidden rounded-[20px] bg-paper outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div className="relative m-2 overflow-hidden rounded-[14px] px-3.5 pb-4 pt-3.5" style={{ background: `color-mix(in oklab, ${fundPastel(id)} 50%, #fff)` }}>
          <span data-art aria-hidden className="v4f-dots pointer-events-none absolute inset-x-0 bottom-0 h-14" style={{ "--dot": fundColor(id) } as CSSProperties} />
          <div className="relative flex items-center gap-2.5">
            <FundMark id={id} size={40} lift />
            <div className="min-w-0">
              <div className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{row?.name ?? seed.name}</div>
              <div className="text-[12px] font-medium" style={{ color: `color-mix(in oklab, ${fundColor(id)} 80%, var(--ink))` }}>
                {mandateWord(seed.mandate)}
              </div>
            </div>
          </div>
          <div className="relative mt-4 flex justify-center">
            <div className="rounded-full bg-paper p-1.5 shadow-[0_0_0_1px_var(--line)]">
              <HoldingsDonut
                id={id}
                holdings={detail?.holdings ?? null}
                cashBps={detail?.cashBps}
                size={128}
                center={
                  detail?.holdings.length ? (
                    <span className="flex flex-col items-center">
                      <span className="v4-num text-[18px] font-medium leading-5 text-ink">{detail.holdings.length}</span>
                      <span className="text-[10.5px] text-ink-3">holdings</span>
                    </span>
                  ) : (
                    <span className="max-w-[72px] text-[10.5px] leading-[13px] text-ink-3">Picks land at the first bell</span>
                  )
                }
              />
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-2">
          <p className="min-h-[38px] text-[13px] leading-[19px] text-ink-2">{MANDATE_LINE[id]}</p>
          {top.length ? (
            <div className="flex h-[22px] gap-1 overflow-hidden" aria-label="Largest holdings">
              {top.map((h) => (
                <span key={h.asset} className="v4-num inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full bg-fill px-2 text-[11px] text-ink-2">
                  {h.asset} <span className="ml-1 text-ink-3">{fmtBps(h.bps)}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex h-[22px] items-center text-[11.5px] text-ink-3">Largest holdings show after the first bell</div>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[12px] text-ink-3">
              <span>Reputation</span>
              <RepBadge score={row?.reputation ?? null} />
            </div>
            <RepBar score={row?.reputation ?? null} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-[12px]">
            <div>
              <dt className="text-ink-3">NAV</dt>
              <dd className="v4-num text-[13px] font-medium text-ink">{row ? fmtUsd(row.nav) : "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-3">vs SPY</dt>
              <dd className={cn("v4-num text-[13px] font-medium", (row?.vsSpy ?? 0) > 0 ? "text-up" : (row?.vsSpy ?? 0) < 0 ? "text-down" : "text-ink")}>{fmtPp(row?.vsSpy)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Manager stake</dt>
              <dd className="v4-num text-[13px] font-medium text-ink">{fmtUsdCompact(seed.seedUsd)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Startups max</dt>
              <dd className="v4-num text-[13px] font-medium text-ink">{fmtBps(seed.startupCapBps)}</dd>
            </div>
          </dl>
          <div className="mt-auto flex items-center justify-between pt-1">
            <BrainChip tier={tier} />
            <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 transition-colors group-hover:text-brand">
              Open
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
                <path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

export function Managers() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: "400px 0px 400px 0px" });
  const { funds, status } = useFunds();
  const details = useFundDetails(FUND_IDS, near && status === "live");
  const rows = new Map(funds.map((f) => [f.id, f]));
  return (
    <Section id="managers" aria-labelledby="managers-title">
      <div ref={ref}>
        <SectionTitle
          id="managers-title"
          eyebrow="The managers"
          title={["Meet the five", "~managers.~"]}
          sub="Same AI, five different mandates and hidden temperaments. Bigger funds can afford a better brain."
        />
        <InView
          as="ul"
          className="-mx-[var(--v4-pad)] mt-12 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--v4-pad)] pb-3 [scrollbar-width:none] md:mt-14 min-[1200px]:mx-0 min-[1200px]:grid min-[1200px]:grid-cols-5 min-[1200px]:gap-4 min-[1200px]:overflow-visible min-[1200px]:px-0 min-[1200px]:pb-0"
          margin="0px 0px -8% 0px"
          aria-label="The five funds"
        >
          {FUND_IDS.map((id, i) => (
            <ManagerCard key={id} id={id} row={rows.get(id) ?? null} detail={details[i]?.data ?? null} i={i} />
          ))}
        </InView>
        <p className="mt-6 text-center text-[13px] text-ink-3 min-[1200px]:hidden">Swipe to see all five.</p>
      </div>
    </Section>
  );
}
