import { BASKET_LABELS, type BasketId } from "@listed/shared";
import { traitBrief, type FundTraits } from "./dna.js";
import type { MarketSnapshot } from "./market.js";
import type { FundProfile } from "./roster.js";
import type { Plan, Rules } from "./rules.js";

export interface FundState {
  bell: number;
  season: number;
  quarter: number;
  valueUsd: number;
  nav: number;
  supplyCoins: number | null;
  outsidePct: number | null;
  reputation: number;
  coinPrice: number | null;
  premiumPct: number | null;
  ret1d: number | null;
  retSeason: number | null;
  vsSpy: number | null;
  current: Plan;

  sinceEntry: Record<string, number | null>;
  turnoverUsedPct: number | null;
  tierLabel: string;
  billSeasonUsd: number;
  cashFloorBps: number;
  promise: { targetBps: number; bondBps: number; progressPct: number | null } | null;

  promiseOpen: boolean;
  crossHoldings: { target: string; valueUsd: number | null; pctOfTarget: number }[];

  crossBudgetUsd?: number | null;

  lastNotes: string[];
}

const f = (v: number | null | undefined, d = 2): string => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(d));
const usd = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}k` : `$${v.toFixed(2)}`;
const basketLabel = (b: string) => BASKET_LABELS[b as BasketId] ?? b;

export function systemPrompt(p: FundProfile, traits: FundTraits, r: Rules, turnoverAllowancePct: number): string {
  return [
    `You manage the ${p.name} fund, one of five AI-run funds on Drixie, a simulation priced off real markets. Investors back the manager they trust; you compete on returns versus SPY, reputation and investors' money.`,
    p.style,
    `Mandate: ${p.mandate}.`,
    `Your private character (shape your choices with it; never mention it or these numbers): ${traitBrief(traits)}.`,
    "",
    "Hard rules (the contract rejects anything else, and a rejected plan means no change this bell):",
    `- exactly ${r.holdings} holdings, each ${r.minHoldingBps}-${r.maxHoldingBps} bps; cash 0-${r.cashMaxBps} bps; holdings + cash = 10000 bps.`,
    `- any one basket ≤ ${r.basketCapBps} bps; the Startups basket ≤ ${r.startupCapBps} bps; India Leaders ≤ ${r.indiaCapBps} bps; the Crypto basket (BTC, ETH, SOL, NEAR, priced 24/7) ≤ ${r.cryptoCapBps} bps${r.cryptoCapBps === 0 ? " (no crypto)" : ""}.`,
    `- per bell every holding moves at most ${r.maxStepBps} bps; at most ${r.maxSwapsPerBell} new holdings per bell; you can only drop a holding that is ≤ ${r.maxStepBps} bps now (shrink big ones first).`,
    "- trading costs 0.10% of turnover (Σ|Δw|/2). Your turnover allowance is " +
      `${turnoverAllowancePct}% of fund value per quarter; going over costs reputation. Moving a holding ≥ 800 bps one way and back within 4 bells is a flip-flop and costs reputation.`,
    "- keep enough cash to pay your brain bill (the cost of your own thinking), or you go on autopilot and cannot move.",
    "- you may buy or sell other funds' coins (cross): at most 10% of a fund's coins, at most 20% of your own value in total, never a fund whose reputation is below 40. Buying a coin and dumping it within a quarter at a profit is a pump and dump (−15 reputation).",
    "- startup prices are estimated marks driven by news; listed stocks hold their last price while markets are closed; crypto moves every bell, day and night.",
    "- you act at EVERY bell in your own style: change at least two weights by 100 bps or more (a trim and an add, or a swap), and say what you changed in the note. Holding everything unchanged is not an option.",
    "- your 10 holdings must look like your mandate, not like the other funds: avoid copying the names the other funds already hold heavily unless your mandate demands them.",
    "",
    "Reply with ONE JSON object and nothing else:",
    '{"weights": {"<asset id>": <bps>, ...10 entries}, "cash_bps": <int>, "cross": [{"fund": "<fund id>", "side": "buy|sell", "usd": <int>}], "note": "<public note>", "think": "normal|deep"' +
      ', "promise": {"target_bps": <int>, "bond_bps": <int>} (only when asked)}',
    "- weights: the full portfolio you want after this bell (asset ids exactly as listed), integers.",
    "- cross: [] unless you have a clear reason.",
    "- note: at most 280 characters of plain English for your investors: what you changed and why. No jargon, no hype, nothing about your character.",
    '- think: "deep" only when the next bell needs extra care (it costs about twice the brain bill).',
  ].join("\n");
}

export function userPrompt(p: FundProfile, s: FundState, m: MarketSnapshot, r: Rules): string {
  const lines: string[] = [];
  lines.push(`Bell ${s.bell} · season ${s.season}, quarter ${s.quarter} · ${m.at}`);
  lines.push(
    `Your fund: value ${usd(s.valueUsd)}, NAV $${f(s.nav, 4)}, 1d ${f(s.ret1d)}%, season ${f(s.retSeason)}% (vs SPY ${f(s.vsSpy)} pp), reputation ${f(s.reputation, 0)}/100, outside holders ${f(s.outsidePct, 1)}%, coin ${s.coinPrice === null ? "n/a" : `$${f(s.coinPrice, 4)}`} (premium ${f(s.premiumPct)}%).`,
  );
  lines.push(
    `Brain tier ${s.tierLabel}; brain bill this season ${usd(s.billSeasonUsd)}. Keep cash ≥ ${s.cashFloorBps} bps. Turnover used this quarter: ${f(s.turnoverUsedPct, 1)}% of ${p.turnoverAllowanceBps / 100}%.`,
  );
  if (s.promiseOpen) lines.push("Promise: not set yet. Set it now with \"promise\": a season return target (target_bps) backed by a bond of up to 3000 bps of your stake (bond_bps). Missing it costs −25 reputation; keeping it earns +10.");
  else if (s.promise) lines.push(`Promise: target ${(s.promise.targetBps / 100).toFixed(1)}% this season, bond ${s.promise.bondBps} bps of your stake; users' return so far ${f(s.promise.progressPct)}%.`);
  const held = Object.entries(s.current.weights).filter(([, b]) => b > 0);
  if (held.length) {
    lines.push(`Current portfolio (bps): ${held.sort((a, b) => b[1] - a[1]).map(([id, b]) => `${id} ${b}${s.sinceEntry[id] != null ? ` (${f(s.sinceEntry[id])}% since entry)` : ""}`).join(", ")}; cash ${s.current.cashBps}.`);
  } else {
    lines.push("Current portfolio: all cash (first allocation: pick your 10 holdings; the per-bell step and swap limits do not apply yet).");
  }
  if (s.crossBudgetUsd !== undefined && s.crossBudgetUsd !== null) {
    lines.push(`Cross budget: up to ${usd(s.crossBudgetUsd)} for other funds' coins (paid from your investors' cash in the vault, within your 20% cap).`);
  }
  if (s.crossHoldings.length) lines.push(`Other funds' coins you hold: ${s.crossHoldings.map((c) => `${c.target} ${usd(c.valueUsd)} (${f(c.pctOfTarget, 1)}% of its coins)`).join(", ")}.`);
  if (s.lastNotes.length) lines.push(`Your recent notes: ${s.lastNotes.map((n) => `"${n}"`).join(" ")}`);
  lines.push("");
  lines.push(`Universe (asset id | basket | price USD | last bell % | 1 day % | ~4 days % | volatility % | held by funds). SPY 1 day ${f(m.spy.change1d)}%.`);
  const byBasket = new Map<string, typeof m.assets>();
  for (const a of m.assets) byBasket.set(a.basket, [...(byBasket.get(a.basket) ?? []), a]);
  for (const [b, list] of byBasket) {
    lines.push(`${basketLabel(b)}${b === "startups" ? " (counts toward the startup cap; private ones are estimated)" : ""}:`);
    for (const a of list) {
      const held = a.heldBy.length ? a.heldBy.map((h) => `${h.fund} ${h.bps}`).join("/") : "-";
      lines.push(`  ${a.id} | ${a.name}${a.estimated ? " (est.)" : ""} | ${f(a.price)} | ${f(a.ret1bell)} | ${f(a.ret1d)} | ${f(a.ret4d)} | ${f(a.vol)} | ${held}`);
    }
  }
  lines.push("");
  if (m.news.length) {
    lines.push("News, last 24 h (sentiment −2..+2 | assets named):");
    for (const n of m.news.slice(0, 25)) lines.push(`  [${n.sentiment ?? "?"}] ${n.title.slice(0, 160)}${n.tickers.length ? ` | ${n.tickers.join(",")}` : ""}`);
  } else {
    lines.push("News, last 24 h: none tagged yet.");
  }
  lines.push("");
  const others = m.funds.filter((x) => x.id !== p.id);
  if (others.length) {
    lines.push("Other funds (id | NAV | coin price | premium % | 1 day % | season % | vs SPY pp | reputation | their last move):");
    for (const o of others) {
      const mv = m.lastMoves[o.id];
      const moved = mv
        ? mv.diffs.filter((d) => d.kind !== "same").slice(0, 4).map((d) => `${d.asset} ${d.delta > 0 ? "+" : ""}${d.delta}`).join(" ")
        : o.top.length
          ? `holds ${o.top.map((t) => `${t.asset} ${t.bps}`).join(", ")}`
          : "no portfolio yet";
      lines.push(`  ${o.id} | ${f(o.nav, 4)} | ${o.coinPrice === null ? "n/a" : f(o.coinPrice, 4)} | ${f(o.premium)} | ${f(o.ret1d)} | ${f(o.retSeason)} | ${f(o.vsSpy)} | ${o.reputation} | ${moved}`);
    }
  }
  lines.push("");
  lines.push(`Decide this bell's portfolio now. Remember: exactly ${r.holdings} holdings, sum 10000 with cash, step ≤ ${r.maxStepBps} bps, ≤ ${r.maxSwapsPerBell} new holdings. JSON only.`);
  return lines.join("\n");
}
