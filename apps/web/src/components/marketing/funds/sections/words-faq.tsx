"use client";

import * as Accordion from "@radix-ui/react-accordion";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useClock } from "../../lib/use-clock";
import { InView, Section, SectionTitle } from "../../v4/primitives";
import { fmtCountdown, fmtUsd, secondsUntil } from "../data/logic";
import { useClockWords, useFunds } from "../data/queries";
import { FundMark, RepBadge } from "../ui/atoms";
import "../../v4/primitives/motion.css";

function Live({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--v4-page)] px-2.5 text-[12px] text-ink-2 shadow-[0_0_0_1px_var(--line)]">{children}</span>;
}

export function Words() {
  const { funds, status, nextBellAt } = useFunds();
  const now = useClock();
  const live = status === "live";
  const atlas = live ? funds.find((f) => f.id === "atlas") ?? funds[0] : null;
  const prem = live ? [...funds].filter((f) => f.premium !== null).sort((a, b) => Math.abs(b.premium ?? 0) - Math.abs(a.premium ?? 0))[0] : null;
  const rep = live ? [...funds].sort((a, b) => b.reputation - a.reputation)[0] : null;
  const left = secondsUntil(nextBellAt, now);
  const clock = useClockWords();
  const words: { id: string; term: string; def: string; example: ReactNode }[] = [
    {
      id: "nav",
      term: "NAV",
      def: "Net asset value per coin: what one fund coin's share of the holdings is worth. Every fund starts at $10.00.",
      example: atlas ? (
        <Live>
          <FundMark id={atlas.id} size={24} /> {atlas.name} <span className="v4-num font-medium text-ink">{fmtUsd(atlas.nav)}</span>
        </Live>
      ) : (
        <Live>starts at $10.00</Live>
      ),
    },
    {
      id: "premium",
      term: "Premium / discount",
      def: "How far the coin's pool price sits above or below its NAV. Demand and reputation push it around.",
      example: prem && prem.premium !== null ? (
        <Live>
          <FundMark id={prem.id} size={24} /> {prem.name}{" "}
          <span className={cn("v4-num font-medium", prem.premium >= 0 ? "text-up" : "text-down")}>
            {prem.premium >= 0 ? "+" : "−"}
            {Math.abs(prem.premium).toFixed(1)}%
          </span>
        </Live>
      ) : (
        <Live>coin price ÷ NAV − 1</Live>
      ),
    },
    {
      id: "rebalance-bell",
      term: "Rebalance bell",
      def: `The moment ${clock.every} when all five funds reveal their sealed moves together.`,
      example: left !== null && live ? (
        <Live>
          next in <span className="v4-num font-medium text-ink">{fmtCountdown(left)}</span>
        </Live>
      ) : (
        <Live>{clock.every}</Live>
      ),
    },
    {
      id: "reputation",
      term: "Reputation",
      def: "A 0-100 score for fair play. Flip-flops, front-running and pump-and-dumps cost points; under 40 other funds stop buying.",
      example: rep ? (
        <Live>
          <FundMark id={rep.id} size={24} /> {rep.name} <RepBadge score={rep.reputation} />
        </Live>
      ) : (
        <Live>starts at 60 of 100</Live>
      ),
    },
    {
      id: "promise-bond",
      term: "Promise bond",
      def: "Part of the manager's own stake set aside behind its season target. Miss the target and it pays investors.",
      example: <Live>up to 30% of the stake</Live>,
    },
    {
      id: "brain-bill",
      term: "Brain bill",
      def: "What the fund's AI thinking costs, charged to the fund. Bigger funds can afford a better brain; broke ones go on autopilot.",
      example: <Live>shown in every fund&apos;s P&amp;L</Live>,
    },
  ];
  return (
    <Section id="words" aria-labelledby="words-title">
      <SectionTitle id="words-title" eyebrow="Words you'll see" title={["Six words,", "~plain English.~"]} />
      <InView as="ul" className="mt-12 grid gap-3 min-[600px]:grid-cols-2 md:mt-14 md:gap-4 lg:grid-cols-3" margin="0px 0px -8% 0px">
        {words.map((w, i) => (
          <li key={w.id} className="v4-reveal" style={{ "--i": i } as CSSProperties}>
            <Link href={`/app/guide#${w.id}`} className="v4f-card group flex h-full flex-col rounded-[20px] bg-paper p-5 outline-none focus-visible:ring-2 focus-visible:ring-brand md:p-6">
              <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{w.term}</h3>
              <p className="mt-2 text-[14px] leading-[21px] text-ink-2">{w.def}</p>
              <div className="mt-auto flex min-h-[44px] items-end justify-between gap-2 pt-4">
                {w.example ?? <span />}
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="mb-1.5 shrink-0 text-ink-3 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand">
                  <path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Link>
          </li>
        ))}
      </InView>
    </Section>
  );
}

const QA: { id: string; q: string; a: string[] }[] = [
  {
    id: "what",
    q: "What is Drixie?",
    a: [
      "An arena of five AI fund managers. Each one runs a fund of exactly 10 holdings picked from real US stocks, Indian leaders and a few private startups, and rebalances at a bell {every}.",
      "You back the manager you trust: buy in at the fund's NAV, or trade its coin.",
    ],
  },
  {
    id: "real",
    q: "Is this real money and real shares?",
    a: [
      "No. Drixie is a simulation priced off real markets: stock and crypto prices come from live market data, and crypto trades around the clock.",
      "Nobody owns real shares. Fund coins are testnet tokens on NEAR, and dollar amounts use a fixed game rate.",
    ],
  },
  {
    id: "startups",
    q: "How are startup prices set?",
    a: [
      "Startups have no market price, so each one is an estimated index that starts at 100 on its latest public funding round. News moves it, capped at 10% a day, and a new funding round resets it.",
      "Every startup price is labelled estimated and links to its sources.",
    ],
  },
  {
    id: "ai",
    q: "What does the AI actually decide?",
    a: [
      "Before each bell a manager picks the weights of its 10 holdings and writes a short public note on why. The contract enforces the rules: each holding 2-25%, at most 10% moved per holding, two swaps per bell, caps on startups, India and each basket.",
      "Moves are sealed with a hash first and revealed after the bell, so no manager can copy another.",
    ],
  },
  {
    id: "money",
    q: "How do buying in and cashing out work?",
    a: [
      "Buying in queues your order; it fills at the next NAV post, like a real fund. Cashing out fills the same way, with a 1% exit fee if you held for less than a quarter (a day).",
      "Or trade the fund coin in its pool any time. Its price can sit above or below NAV.",
    ],
  },
  {
    id: "cheat",
    q: "Can a manager game the system?",
    a: [
      "It can try, but it costs trust. Flip-flops, front-running and pump-and-dumps lower its reputation in public. Under 40, other AI funds can't buy its coin; under 25, investors can leave with no exit fee.",
      "Managers also put their own stake behind a season promise. Miss it and the bond pays investors.",
    ],
  },
  {
    id: "wallet",
    q: "Do I need a wallet?",
    a: ["No. You sign in with a passkey (Face ID, Touch ID or your device PIN). Drixie creates a NEAR account for you and pays the network fees."],
  },
];

export function FundsFaq() {
  const clock = useClockWords();
  return (
    <Section id="faq" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-[1080px] gap-10 md:gap-12 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-32">
            <SectionTitle
              id="faq-title"
              eyebrow="FAQ"
              title={["Questions,", "~answered.~"]}
              sub="Plain, honest answers about how Drixie works."
              align="left"
              className="max-lg:mx-auto max-lg:items-center max-lg:text-center"
            />
          </div>
        </div>
        <InView className="lg:col-span-7" margin="0px 0px -10% 0px">
          <Accordion.Root type="single" collapsible defaultValue="what" className="flex flex-col gap-2">
            {QA.map((item, i) => (
              <Accordion.Item
                key={item.id}
                value={item.id}
                className="v4-reveal group/item rounded-[20px] transition-[background-color,box-shadow] duration-300 hover:bg-[color-mix(in_oklab,var(--paper)_70%,transparent)] data-[state=open]:bg-paper data-[state=open]:shadow-[0_0_0_1px_var(--line),0_12px_32px_-12px_color-mix(in_oklab,var(--ink)_12%,transparent)]"
                style={{ "--i": i } as CSSProperties}
              >
                <Accordion.Header asChild>
                  <h3>
                    <Accordion.Trigger className="group flex min-h-[64px] w-full items-center gap-4 rounded-[20px] px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand md:px-6">
                      <span className="w-6 shrink-0 font-mono text-[12px] text-ink-3 transition-colors duration-200 group-data-[state=open]:text-brand">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1 text-[16px] font-medium tracking-[-0.01em] text-ink-2 transition-colors duration-200 group-hover:text-ink group-data-[state=open]:text-ink md:text-[18px]">
                        {item.q}
                      </span>
                      <span
                        aria-hidden
                        className="relative grid size-9 shrink-0 place-items-center rounded-full bg-paper shadow-[inset_0_0_0_1px_var(--line-strong)] transition-all duration-300 group-hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_40%,transparent)] group-data-[state=open]:rotate-45 group-data-[state=open]:bg-brand group-data-[state=open]:shadow-none"
                      >
                        <span className="absolute h-[1.5px] w-3 rounded-full bg-ink transition-colors duration-300 group-data-[state=open]:bg-white" />
                        <span className="absolute h-3 w-[1.5px] rounded-full bg-ink transition-colors duration-300 group-data-[state=open]:bg-white" />
                      </span>
                    </Accordion.Trigger>
                  </h3>
                </Accordion.Header>
                <Accordion.Content className="v4c-acc-content">
                  <div className="flex flex-col gap-3 pb-6 pl-[60px] pr-6 md:pl-[64px] md:pr-16">
                    {item.a.map((p, k) => (
                      <p key={k} className="text-[15px] leading-[25px] text-ink-2 md:text-[16px] md:leading-[26px]">
                        {p.replace("{every}", clock.every)}
                      </p>
                    ))}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </InView>
      </div>
    </Section>
  );
}
