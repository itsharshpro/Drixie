import type { BadgeKind } from "./badge";
import type { BasketCardData, BasketHolding } from "./basket";

export interface CardExtra {
  kind?: string;
  fund: string;
  edition: number;
  bell: number;

  nav: string | number;
  prices_hash?: string | null;
  cash_bps: number;

  weights: string;
}

const BADGE_ALIASES: Record<string, BadgeKind> = {
  season_winner: "season_winner",
  season_winner_backer: "season_winner",
  black_swan: "black_swan",
  black_swan_holder: "black_swan",
  early_backer: "early_backer",
  kept_faith: "kept_faith",
};

export function badgeKind(kind: string): BadgeKind | null {
  return BADGE_ALIASES[kind] ?? null;
}

function parseExtra(x: CardExtra | string): CardExtra {
  return typeof x === "string" ? (JSON.parse(x) as CardExtra) : x;
}

function weightsOf(text: string): [string, number][] {
  return text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.lastIndexOf(":");
      return [p.slice(0, i), Number(p.slice(i + 1))] as [string, number];
    })
    .filter(([a, b]) => a.length > 0 && Number.isInteger(b) && b > 0);
}

export interface CardMeta {
  name: string;
  mandate: string;

  at: string | number;
  season?: number | null;

  assets?: Record<string, { label?: string; estimated?: boolean }>;

  previous?: CardExtra | string | null;
}

export function basketFromExtra(extra: CardExtra | string, meta: CardMeta): BasketCardData {
  const x = parseExtra(extra);
  const prev = meta.previous ? new Map(weightsOf(parseExtra(meta.previous).weights)) : null;
  const holdings: BasketHolding[] = weightsOf(x.weights).map(([asset, bps]) => {
    const info = meta.assets?.[asset];
    const h: BasketHolding = { asset, bps };
    if (info?.label) h.label = info.label;
    if (info?.estimated) h.estimated = true;
    if (prev) {
      const before = prev.get(asset);
      if (before === undefined) h.entered = true;
      else if (before !== bps) h.delta = bps - before;
    }
    return h;
  });
  return {
    fund: x.fund,
    name: meta.name,
    mandate: meta.mandate,
    edition: Number(x.edition),
    bell: Number(x.bell),
    at: meta.at,
    nav: Number(x.nav) / 1_000_000,
    holdings,
    cashBps: Number(x.cash_bps),
    pricesHash: x.prices_hash ?? null,
    season: meta.season ?? null,
  };
}
