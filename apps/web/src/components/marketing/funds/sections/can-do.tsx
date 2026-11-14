"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { InView, Section, SectionTitle } from "../../v4/primitives";
import { FundMark } from "../ui/atoms";

type Item = { id: string; title: string; line: string; place: string; href: string; pastel: string; art: ReactNode };

const UP = "var(--candle-up)";
const DOWN = "var(--candle-down)";

function ArtBuyIn() {
  return (
    <svg viewBox="0 0 200 96" className="h-full w-full" aria-hidden>
      <rect x="18" y="30" width="58" height="36" rx="10" fill="#fff" stroke="var(--line-strong)" />
      <text x="47" y="52" textAnchor="middle" className="font-mono text-[11px]" fill="var(--ink-2)">NEAR</text>
      <path d="M84 48h30" stroke="var(--brand)" strokeWidth="1.6" strokeDasharray="3 3" className="v4f-flow" />
      <path d="M110 43l6 5-6 5" fill="none" stroke="var(--brand)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${140 + i * 6} ${58 - i * 9})`}>
          <ellipse cx="18" cy="0" rx="18" ry="6" fill="#fff" stroke="var(--viz-cobalt)" strokeWidth="1.4" />
        </g>
      ))}
      <text x="164" y="80" textAnchor="middle" className="text-[10px]" fill="var(--ink-3)">coins at NAV</text>
    </svg>
  );
}

function ArtTrade() {
  const cs: [number, number, number, number][] = [
    [40, 34, 54, 1], [52, 40, 60, 0], [64, 30, 50, 1], [76, 26, 44, 1], [88, 32, 50, 0], [100, 24, 40, 1], [112, 18, 36, 1], [124, 22, 42, 0], [136, 14, 32, 1], [148, 10, 28, 1],
  ];
  return (
    <svg viewBox="0 0 200 96" className="h-full w-full" aria-hidden>
      <line x1="28" x2="172" y1="46" y2="46" stroke="var(--ink-3)" strokeDasharray="3 3" />
      <text x="172" y="58" textAnchor="end" className="text-[9.5px]" fill="var(--ink-3)">NAV</text>
      {cs.map(([x, y0, y1, up], i) => (
        <g key={i} className="v4f-candle" style={{ "--i": i } as CSSProperties}>
          <line x1={x} x2={x} y1={y0 - 4} y2={y1 + 4} stroke={up ? UP : DOWN} />
          <rect x={x - 3.5} y={y0} width="7" height={y1 - y0} rx="1.5" fill={up ? UP : DOWN} />
        </g>
      ))}
    </svg>
  );
}

function ArtRisk() {
  return (
    <svg viewBox="0 0 200 96" className="h-full w-full" aria-hidden>
      <path d="M52 78a48 48 0 0 1 96 0" fill="none" stroke="var(--line-strong)" strokeWidth="10" strokeLinecap="round" />
      <path d="M52 78a48 48 0 0 1 22-40" fill="none" stroke="var(--viz-teal)" strokeWidth="10" strokeLinecap="round" />
      <path d="M80 34a48 48 0 0 1 40 0" fill="none" stroke="var(--viz-gold)" strokeWidth="10" strokeLinecap="round" />
      <path d="M126 38a48 48 0 0 1 22 40" fill="none" stroke="var(--viz-clay)" strokeWidth="10" strokeLinecap="round" />
      <g className="v4f-needle" style={{ transformOrigin: "100px 78px" }}>
        <line x1="100" y1="78" x2="100" y2="40" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="78" r="5" fill="var(--ink)" />
    </svg>
  );
}

function ArtPredict() {
  const ids = ["kite", "nova", "atlas", "meridian", "orion"];
  const hs = [34, 50, 64, 42, 26];
  return (
    <div className="flex h-full items-end justify-center gap-2 pb-3" aria-hidden>
      {ids.map((id, i) => (
        <div key={id} className="flex flex-col items-center gap-1.5">
          <FundMark id={id} size={24} lift />
          <span className="v4f-bar block w-7 rounded-t-[6px]" style={{ height: hs[i], background: i === 2 ? "var(--gold)" : "color-mix(in oklab, var(--ink) 10%, transparent)", "--i": i } as CSSProperties} />
        </div>
      ))}
    </div>
  );
}

function ArtCards() {
  const ids = ["orion", "nova", "atlas"];
  return (
    <div className="relative flex h-full items-center justify-center" aria-hidden>
      {ids.map((id, i) => (
        <div
          key={id}
          className="v4f-fan absolute h-[74px] w-[58px] rounded-[10px] bg-paper p-1.5 shadow-[0_0_0_1px_var(--line),0_8px_18px_-10px_color-mix(in_oklab,var(--ink)_30%,transparent)]"
          style={{ "--r": `${(i - 1) * 12}deg`, "--x": `${(i - 1) * 30}px`, zIndex: i === 1 ? 2 : 1 } as CSSProperties}
        >
          <FundMark id={id} size={24} />
          <div className="mt-1.5 flex flex-col gap-[3px]">
            {[80, 62, 48, 36].map((w, k) => (
              <span key={k} className="block h-[3px] rounded-full" style={{ width: `${w}%`, background: `color-mix(in oklab, var(--viz-${id === "orion" ? "gold" : id === "nova" ? "plum" : "cobalt"}) ${70 - k * 14}%, #fff)` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtSeat() {
  return (
    <svg viewBox="0 0 200 96" className="h-full w-full" aria-hidden>
      <rect x="70" y="22" width="44" height="34" rx="9" fill="#fff" stroke="var(--line-strong)" />
      <rect x="64" y="54" width="56" height="12" rx="5" fill="var(--brand)" />
      <line x1="72" y1="66" x2="70" y2="82" stroke="var(--ink-2)" strokeWidth="2" strokeLinecap="round" />
      <line x1="112" y1="66" x2="114" y2="82" stroke="var(--ink-2)" strokeWidth="2" strokeLinecap="round" />
      <g className="v4f-gavel" style={{ transformOrigin: "150px 70px" }}>
        <rect x="136" y="28" width="26" height="12" rx="3" fill="var(--gold)" />
        <line x1="149" y1="40" x2="149" y2="66" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" />
      </g>
      <rect x="132" y="76" width="34" height="6" rx="3" fill="color-mix(in oklab, var(--ink) 14%, transparent)" />
    </svg>
  );
}

const ITEMS: Item[] = [
  { id: "buy", title: "Buy in at NAV", line: "Your money joins a fund at its next NAV post, the way a real fund takes it in.", place: "Funds", href: "/app", pastel: "var(--sky)", art: <ArtBuyIn /> },
  { id: "trade", title: "Trade a fund coin", line: "Every fund has its own coin in a pool. It floats above or below NAV with demand.", place: "Funds", href: "/app", pastel: "var(--mint)", art: <ArtTrade /> },
  { id: "risk", title: "Pick by risk", line: "Answer three questions and see which managers fit how you invest.", place: "Risk check", href: "/app/start", pastel: "var(--lime)", art: <ArtRisk /> },
  { id: "predict", title: "Predict the quarter", line: "Call which fund wins today's quarter. Calls are scored when it closes.", place: "Compete", href: "/app/compete", pastel: "var(--lavender)", art: <ArtPredict /> },
  { id: "cards", title: "Collect basket cards", line: "Every reveal mints a card of the fund's 10 holdings. Mint a copy of any edition.", place: "Gallery", href: "/app/gallery", pastel: "var(--pink)", art: <ArtCards /> },
  { id: "seat", title: "Bid for a seat", line: "Win a manager seat at auction and earn 30% of that fund's fees.", place: "Gallery", href: "/app/gallery", pastel: "var(--sky)", art: <ArtSeat /> },
];

export function FundsCanDo() {
  return (
    <Section id="what-you-can-do" aria-labelledby="can-do-title">
      <SectionTitle id="can-do-title" eyebrow="What you can do" title={["Six ways to play", "~the arena.~"]} sub="Back a manager, trade its coin, call the quarter or collect its history." />
      <InView as="ul" className="mt-12 grid gap-3 min-[600px]:grid-cols-2 md:mt-14 md:gap-4 lg:grid-cols-3" margin="0px 0px -8% 0px">
        {ITEMS.map((it, i) => (
          <li key={it.id} className="v4-reveal" style={{ "--i": i } as CSSProperties}>
            <Link
              href={it.href}
              className="v4f-card group flex h-full flex-col overflow-hidden rounded-[20px] bg-paper outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="relative m-2 h-[112px] overflow-hidden rounded-[14px]" style={{ background: `color-mix(in oklab, ${it.pastel} 55%, #fff)` }}>
                <span data-art aria-hidden className="v4f-dots pointer-events-none absolute inset-x-0 bottom-0 h-12" />
                <div className="relative h-full">{it.art}</div>
              </div>
              <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
                <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{it.title}</h3>
                <p className="mt-1.5 text-[14px] leading-[21px] text-ink-2">{it.line}</p>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="inline-flex h-6 items-center rounded-full bg-fill px-2.5 text-[11.5px] font-medium text-ink-2">In {it.place}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="text-ink-3 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand">
                    <path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </InView>
    </Section>
  );
}
