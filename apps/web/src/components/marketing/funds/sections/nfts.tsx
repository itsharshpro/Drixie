"use client";

import { FUND_IDS, type Move } from "@listed/shared";
import Link from "next/link";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { API_BASE } from "../../lib/api";
import { InView, Section, SectionTitle, useInView } from "../../v4/primitives";
import { fundColor, fundName } from "../data/logic";
import { useFunds, useNewestMove } from "../data/queries";
import { FundMark } from "../ui/atoms";

function BasketArt({ move }: { move: Move | null }) {
  const [broken, setBroken] = useState(false);
  if (move?.edition && !broken) {
    return (

      <img
        src={`${API_BASE}/nft/basket/${encodeURIComponent(move.fund)}/${move.edition}.svg`}
        alt={`${move.fundName} basket card, edition ${move.edition}`}
        className="h-[168px] w-auto rounded-[12px] shadow-[0_0_0_1px_var(--line),0_16px_32px_-16px_color-mix(in_oklab,var(--ink)_35%,transparent)]"
        onError={() => setBroken(true)}
        loading="lazy"
      />
    );
  }
  const id = move?.fund ?? "nova";
  return (
    <div className="v4f-float w-[124px] rounded-[14px] bg-paper p-3 shadow-[0_0_0_1px_var(--line),0_16px_32px_-16px_color-mix(in_oklab,var(--ink)_35%,transparent)]" aria-hidden>
      <div className="flex items-center gap-1.5">
        <FundMark id={id} size={24} />
        <span className="text-[11px] font-semibold text-ink">{fundName(id)}</span>
      </div>
      <div className="mt-2 flex flex-col gap-[4px]">
        {[90, 74, 64, 56, 48, 40, 34, 28, 22, 18].map((w, k) => (
          <span key={k} className="block h-[3px] rounded-full" style={{ width: `${w}%`, background: `color-mix(in oklab, ${fundColor(id)} ${86 - k * 6}%, #fff)` }} />
        ))}
      </div>
      <div className="mt-2 whitespace-nowrap border-t border-dashed border-line pt-1.5 font-mono text-[9px] text-ink-3">edition · bell</div>
    </div>
  );
}

function SeatArt() {
  return (
    <div className="grid grid-cols-5 gap-2" aria-hidden>
      {FUND_IDS.map((id, i) => (
        <div key={id} className="v4f-seat flex flex-col items-center gap-1.5" style={{ "--i": i } as CSSProperties}>
          <span className="grid size-11 place-items-center rounded-full bg-paper shadow-[0_0_0_1px_var(--line),0_6px_14px_-8px_color-mix(in_oklab,var(--ink)_30%,transparent)]" style={{ boxShadow: `0 0 0 2px color-mix(in oklab, ${fundColor(id)} 30%, transparent)` }}>
            <FundMark id={id} size={24} />
          </span>
          <span className="h-1.5 w-7 rounded-full" style={{ background: `color-mix(in oklab, ${fundColor(id)} 40%, transparent)` }} />
        </div>
      ))}
    </div>
  );
}

function BadgeArt() {
  const badges: [string, string][] = [
    ["var(--gold)", "M7 1.8 8.6 5l3.5.5-2.5 2.4.6 3.5L7 9.8l-3.2 1.6.6-3.5L1.9 5.5 5.4 5Z"],
    ["var(--ink)", "M2 10 5 6l2.2 2.4L12 3"],
    ["var(--brand)", "M7 2v10M2 7h10"],
    ["var(--candle-up)", "M2.5 7.2 5.6 10 11.5 4"],
  ];
  return (
    <div className="flex items-center gap-2.5" aria-hidden>
      {badges.map(([c, d], i) => (
        <span key={i} className="v4f-badge grid size-12 place-items-center rounded-full bg-paper" style={{ boxShadow: `0 0 0 1px var(--line), 0 0 0 4px color-mix(in oklab, ${c} 12%, transparent)`, "--i": i } as CSSProperties}>
          <svg width="18" height="18" viewBox="0 0 14 14">
            <path d={d} fill={i === 0 ? c : "none"} stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ))}
    </div>
  );
}

function TrophyArt() {
  return (
    <svg width="96" height="104" viewBox="0 0 96 104" aria-hidden className="v4f-float">
      <path d="M28 14h40v22c0 13-9 24-20 24S28 49 28 36Z" fill="var(--gold)" />
      <path d="M28 20H16c0 12 6 20 14 21M68 20h12c0 12-6 20-14 21" fill="none" stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" />
      <rect x="43" y="60" width="10" height="16" fill="color-mix(in oklab, var(--gold) 80%, var(--ink))" />
      <rect x="30" y="76" width="36" height="12" rx="3" fill="var(--ink)" />
      <path d="M40 30l5 5 10-11" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M36 18c2 6 2 12 0 18" stroke="#fff" strokeWidth="2" opacity="0.35" fill="none" strokeLinecap="round" />
    </svg>
  );
}

type Tile = { id: string; title: string; line: string; art: ReactNode; pastel: string };

export function Nfts() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: "300px 0px 300px 0px" });
  const { status } = useFunds();
  const move = useNewestMove(near && status === "live");
  const tiles: Tile[] = [
    { id: "basket", title: "Living basket cards", line: "Minted at every reveal with the fund's weights, NAV and price hash. Many editions means a restless manager.", art: <BasketArt move={move} />, pastel: "var(--lavender)" },
    { id: "seat", title: "Manager seats", line: "Five seats, one per fund. The holder earns 30% of the fees on investors' money. Won at auction.", art: <SeatArt />, pastel: "var(--sky)" },
    { id: "badges", title: "Investor badges", line: "Backed the season winner, held through a black-swan day, early backer, kept faith. Yours for good.", art: <BadgeArt />, pastel: "var(--mint)" },
    { id: "trophy", title: "The trophy", line: "Manager of the Year, minted to the winning fund's seat holder when the season closes.", art: <TrophyArt />, pastel: "var(--lime)" },
  ];
  return (
    <Section id="nfts" aria-labelledby="nfts-title">
      <div ref={ref}>
        <SectionTitle id="nfts-title" eyebrow="NFTs" title={["Every bell leaves", "~something to keep.~"]} sub="All of it is minted on NEAR in the same contract as the funds." />
        <InView as="ul" className="mt-12 grid gap-3 min-[600px]:grid-cols-2 md:mt-14 md:gap-4 lg:grid-cols-4" margin="0px 0px -8% 0px">
          {tiles.map((t, i) => (
            <li key={t.id} className="v4-reveal" style={{ "--i": i } as CSSProperties}>
              <Link href="/app/gallery" className="v4f-card group flex h-full flex-col overflow-hidden rounded-[20px] bg-paper outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <div className="relative m-2 grid h-[200px] place-items-center overflow-hidden rounded-[14px]" style={{ background: `color-mix(in oklab, ${t.pastel} 50%, #fff)` }}>
                  <span data-art aria-hidden className="v4f-dots pointer-events-none absolute inset-x-0 bottom-0 h-16" />
                  <div className="relative">{t.art}</div>
                </div>
                <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
                  <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{t.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-[21px] text-ink-2">{t.line}</p>
                </div>
              </Link>
            </li>
          ))}
        </InView>
      </div>
    </Section>
  );
}
