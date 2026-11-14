"use client";

import { BASKET_LABELS, BASKETS, FUND_IDS, type Asset, type BasketId } from "@listed/shared";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { useRef } from "react";
import { InView, Section, SectionTitle, useInView } from "../../v4/primitives";
import { fmtPct, fmtUsd, tone } from "../data/logic";
import { useAssets } from "../data/queries";
import { FundGlyph } from "../ui/atoms";

const UNIVERSE: Record<BasketId, string[]> = {
  ai_chips: ["NVDA", "AMD", "AVGO", "TSM", "ASML", "MU"],
  big_tech: ["AAPL", "MSFT", "GOOGL", "AMZN", "META"],
  finance: ["JPM", "GS", "V", "MA", "BRK-B"],
  energy_ev: ["TSLA", "XOM", "CVX", "NEE"],
  consumer: ["COST", "WMT", "NKE", "MCD", "KO"],
  healthcare: ["LLY", "UNH", "JNJ", "PFE"],
  india: ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "BHARTIARTL.NS", "ITC.NS"],
  startups: ["SPCX", "Stripe", "Databricks", "Revolut", "Canva", "Zepto", "Razorpay", "Perplexity"],
  crypto: ["BTC", "ETH", "SOL", "NEAR"],
};

const PASTEL: Record<BasketId, string> = {
  ai_chips: "var(--lavender)",
  big_tech: "var(--sky)",
  finance: "var(--mint)",
  energy_ev: "var(--lime)",
  consumer: "var(--pink)",
  healthcare: "var(--mint)",
  india: "var(--lime)",
  startups: "var(--lavender)",
  crypto: "var(--sky)",
};

const short = (id: string) => id.replace(/\.NS$/, "");

function Row({ a, label }: { a: Asset | null; label: string }) {
  const t = tone(a?.change1d);
  return (
    <li className="flex h-9 items-center gap-2 border-b border-line last:border-b-0">
      <span className="v4-num w-[76px] shrink-0 truncate text-[12.5px] font-medium text-ink">{short(label)}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {(a?.heldBy ?? []).slice(0, 3).map((h) => (
          <span key={h.fund} title={`Held by ${h.fund}`} className="grid size-4 place-items-center rounded-[4px] border border-line bg-paper">
            <FundGlyph id={h.fund} box={9} />
          </span>
        ))}
        {a?.estimated ? <span className="rounded-full bg-gold-soft px-1.5 text-[10px] font-medium text-gold-text">est.</span> : null}
      </span>
      <span className="v4-num text-[12.5px] text-ink-2">{a?.price !== null && a?.price !== undefined ? fmtUsd(a.price) : <span className="text-ink-3">—</span>}</span>
      <span className={cn("v4-num w-[52px] text-right text-[11.5px] font-medium", t === "up" ? "text-up" : t === "down" ? "text-down" : "text-ink-3")}>
        {a?.change1d !== null && a?.change1d !== undefined ? fmtPct(a.change1d) : ""}
      </span>
    </li>
  );
}

export function Baskets() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: "400px 0px 400px 0px" });
  const q = useAssets(near);
  const byBasket = new Map((q.data?.baskets ?? []).map((b) => [b.id, b]));
  const spy = q.data?.benchmark;
  return (
    <Section id="baskets" aria-labelledby="baskets-title">
      <div ref={ref}>
        <SectionTitle
          id="baskets-title"
          eyebrow="The baskets"
          title={["48 real assets,", "~nine baskets.~"]}
          sub="US leaders, Indian blue chips, private startups and 24/7 crypto. Managers pick 10 at a time within their caps."
        />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[12.5px] text-ink-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-paper px-3 shadow-[0_0_0_1px_var(--line)]">
            Benchmark <span className="v4-num font-medium text-ink">SPY</span>
            {spy?.price ? <span className="v4-num">{fmtUsd(spy.price)}</span> : null}
            {spy?.change1d !== null && spy?.change1d !== undefined ? (
              <span className={cn("v4-num font-medium", tone(spy.change1d) === "up" ? "text-up" : tone(spy.change1d) === "down" ? "text-down" : "text-ink-3")}>{fmtPct(spy.change1d)}</span>
            ) : null}
          </span>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-paper px-3 shadow-[0_0_0_1px_var(--line)]">
            <span className="flex -space-x-0.5">
              {FUND_IDS.slice(0, 3).map((id) => (
                <span key={id} className="grid size-4 place-items-center rounded-[4px] border border-line bg-paper">
                  <FundGlyph id={id} box={9} />
                </span>
              ))}
            </span>
            = funds holding it
          </span>
        </div>
        <InView as="ul" className="mt-10 grid gap-3 min-[600px]:grid-cols-2 md:mt-12 md:gap-4 lg:grid-cols-3" margin="0px 0px -8% 0px">
          {BASKETS.map((id, i) => {
            const b = byBasket.get(id);
            const assets = b?.assets ?? [];
            const list: { key: string; a: Asset | null }[] = assets.length ? assets.map((a) => ({ key: a.id, a })) : (UNIVERSE[id] ?? []).map((t) => ({ key: t, a: null }));
            return (
              <li key={id} className="v4-reveal" style={{ "--i": i % 3 } as CSSProperties}>
                <div className="v4f-card flex h-full flex-col overflow-hidden rounded-[20px] bg-paper">
                  <div className="relative m-2 flex items-center justify-between overflow-hidden rounded-[14px] px-3.5 py-3" style={{ background: `color-mix(in oklab, ${PASTEL[id]} 55%, #fff)` }}>
                    <span data-art aria-hidden className="v4f-dots pointer-events-none absolute inset-x-0 bottom-0 h-8" />
                    <span className="relative text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{b?.label ?? BASKET_LABELS[id]}</span>
                    <span className="v4-num relative text-[11.5px] text-ink-2">{list.length}</span>
                  </div>
                  <ul className="px-4">
                    {list.slice(0, 5).map(({ key, a }) => (
                      <Row key={key} a={a} label={a ? (a.kind === "startup" ? a.name : a.id) : key} />
                    ))}
                    {Array.from({ length: Math.max(0, 5 - list.length) }, (_, k) => (
                      <li key={`pad${k}`} aria-hidden className="h-11" />
                    ))}
                  </ul>
                  <div className="mx-4 mb-3 mt-1 flex h-6 items-center justify-between text-[11.5px] text-ink-3">
                    <span>{id === "crypto" ? "Moves 24/7" : id === "startups" ? "Estimated prices" : id === "india" ? "Priced in INR, shown in $" : "Real prices"}</span>
                    {list.length > 5 ? <span className="v4-num">+{list.length - 5} more</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </InView>
        {q.isError && !q.data ? (
          <p className="mx-auto mt-6 max-w-[620px] text-center text-[13px] leading-5 text-ink-3">Prices are unreachable right now; the list shows the universe the managers pick from.</p>
        ) : null}
      </div>
    </Section>
  );
}
