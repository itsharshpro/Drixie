export interface FundSnap {
  id: string;

  nav: number;

  coinPrice: number | null;
  ret1d: number | null;
  reputation: number;
  status: string;
}

export interface Book {

  cashUsd: number;

  coins: Record<string, bigint>;

  pending: Set<string>;

  pendingUsd?: Record<string, number>;
}

export type HouseAction =
  | { kind: "subscribe"; fund: string; usd: number; why: string }
  | { kind: "redeem"; fund: string; coins: bigint; why: string }
  | { kind: "buy_coin"; fund: string; usd: number; why: string }
  | { kind: "sell_coin"; fund: string; coins: bigint; why: string };

export interface Sizing {

  maxShare: number;

  minUsd: number;
}

export const REPUTATION_FLOOR = 40;

export const ARB_BAND = 0.01;
export const DRIFT = 0.05;

export const PLANNER_MIX: Record<string, number> = { atlas: 0.3, meridian: 0.3, nova: 0.2, orion: 0.1, kite: 0.1 };

const COIN = 10n ** 18n;

export const coinsNum = (raw: bigint): number => Number(raw / 10n ** 12n) / 1e6;

export const coinsPart = (raw: bigint, share: number): bigint => (raw * BigInt(Math.max(0, Math.min(1_000_000, Math.floor(share * 1_000_000))))) / 1_000_000n;
export const valueUsd = (raw: bigint, nav: number): number => coinsNum(raw) * nav;

export const heldUsd = (book: Book, f: FundSnap): number => valueUsd(book.coins[f.id] ?? 0n, f.nav) + (book.pendingUsd?.[f.id] ?? 0);

export function equityUsd(book: Book, funds: FundSnap[]): number {
  let total = book.cashUsd;
  for (const f of funds) total += heldUsd(book, f);
  return total;
}

const live = (funds: FundSnap[]) => funds.filter((f) => f.status !== "liquidated" && f.nav > 0);
const spend = (book: Book, equity: number, s: Sizing, want: number): number => Math.min(book.cashUsd, equity * s.maxShare, want);

export function chaser(funds: FundSnap[], book: Book, s: Sizing): HouseAction[] {
  const ranked = live(funds)
    .filter((f) => f.ret1d !== null && f.reputation >= REPUTATION_FLOOR)
    .sort((a, b) => (b.ret1d as number) - (a.ret1d as number));
  if (ranked.length < 2) return [];
  const best = ranked[0] as FundSnap;
  const worst = ranked[ranked.length - 1] as FundSnap;
  const out: HouseAction[] = [];
  const eq = equityUsd(book, funds);
  const held = book.coins[worst.id] ?? 0n;
  if (worst.id !== best.id && (worst.ret1d as number) < 0 && held > 0n && !book.pending.has(worst.id)) {
    const coins = coinsPart(held, 0.5);
    if (valueUsd(coins, worst.nav) >= s.minUsd) out.push({ kind: "redeem", fund: worst.id, coins, why: `${worst.id} was the worst fund over 1 day (${fmtPct(worst.ret1d)})` });
  }
  const usd = spend(book, eq, s, eq * s.maxShare);
  if (usd >= s.minUsd && !book.pending.has(best.id) && (best.ret1d as number) > 0) {
    out.push({ kind: "subscribe", fund: best.id, usd, why: `${best.id} was the best fund over 1 day (${fmtPct(best.ret1d)})` });
  }
  return out;
}

export function prudent(funds: FundSnap[], book: Book, s: Sizing): HouseAction[] {
  const out: HouseAction[] = [];
  const all = live(funds);
  for (const f of all) {
    const held = book.coins[f.id] ?? 0n;
    if (f.reputation < REPUTATION_FLOOR && held > 0n && !book.pending.has(f.id)) {
      out.push({ kind: "redeem", fund: f.id, coins: held, why: `${f.id} reputation ${f.reputation} is below ${REPUTATION_FLOOR}` });
    }
  }
  const good = all.filter((f) => f.reputation >= REPUTATION_FLOOR);
  if (!good.length) return out;
  const eq = equityUsd(book, funds);
  const target = eq / good.length;

  const under = good
    .map((f) => ({ f, gap: target - heldUsd(book, f) }))
    .filter((x) => x.gap > Math.max(s.minUsd, eq * DRIFT) && !book.pending.has(x.f.id))
    .sort((a, b) => b.gap - a.gap)[0];
  if (under) {
    const usd = spend(book, eq, s, under.gap);
    if (usd >= s.minUsd) out.push({ kind: "subscribe", fund: under.f.id, usd, why: `equal parts in funds with reputation ≥ ${REPUTATION_FLOOR}` });
  }
  return out;
}

export function planner(funds: FundSnap[], book: Book, s: Sizing, mix: Record<string, number> = PLANNER_MIX): HouseAction[] {
  const all = live(funds).filter((f) => mix[f.id] !== undefined);
  if (!all.length) return [];
  const eq = equityUsd(book, funds);
  if (eq <= 0) return [];
  const out: HouseAction[] = [];
  const drift = all.map((f) => {
    const have = heldUsd(book, f) / eq;
    return { f, have, want: mix[f.id] as number, gap: (mix[f.id] as number) - have };
  });
  const over = drift.filter((d) => d.gap < -DRIFT && !book.pending.has(d.f.id)).sort((a, b) => a.gap - b.gap)[0];
  if (over) {
    const held = book.coins[over.f.id] ?? 0n;
    const coins = coinsPart(held, Math.min(1, -over.gap / Math.max(over.have, 1e-9)));
    if (valueUsd(coins, over.f.nav) >= s.minUsd) {
      out.push({ kind: "redeem", fund: over.f.id, coins, why: `${over.f.id} is ${pct(over.have)} of the book, target ${pct(over.want)}` });
    }
  }
  const under = drift.filter((d) => d.gap > DRIFT && !book.pending.has(d.f.id)).sort((a, b) => b.gap - a.gap)[0];
  if (under) {
    const usd = spend(book, eq, s, under.gap * eq);
    if (usd >= s.minUsd) out.push({ kind: "subscribe", fund: under.f.id, usd, why: `${under.f.id} is ${pct(under.have)} of the book, target ${pct(under.want)}` });
  }
  return out;
}

export function arb(funds: FundSnap[], book: Book, s: Sizing): HouseAction[] {
  const out: HouseAction[] = [];
  const eq = equityUsd(book, funds);
  for (const f of live(funds)) {
    if (f.coinPrice === null || f.coinPrice <= 0) continue;
    const premium = f.coinPrice / f.nav - 1;
    const held = book.coins[f.id] ?? 0n;
    if (premium <= -ARB_BAND && f.reputation >= REPUTATION_FLOOR) {

      const usd = spend(book, eq, s, eq * s.maxShare * Math.min(1, -premium / 0.1));
      if (usd >= s.minUsd) out.push({ kind: "buy_coin", fund: f.id, usd, why: `coin ${fmtPct(premium * 100)} under NAV` });
    } else if (premium >= ARB_BAND) {
      if (held > 0n) {
        const coins = coinsPart(held, Math.min(1, premium / 0.1));
        if (valueUsd(coins, f.coinPrice) >= s.minUsd) out.push({ kind: "sell_coin", fund: f.id, coins, why: `coin ${fmtPct(premium * 100)} over NAV` });
      } else if (!book.pending.has(f.id)) {
        const usd = spend(book, eq, s, eq * s.maxShare * 0.5);
        if (usd >= s.minUsd) out.push({ kind: "subscribe", fund: f.id, usd, why: `coin ${fmtPct(premium * 100)} over NAV: buy in at NAV to sell in the pool` });
      }
    }
  }
  return out;
}

export const RULES = { chaser, prudent, planner, arb } as const;
export type RuleName = keyof typeof RULES;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtPct = (x: number | null) => (x === null ? "n/a" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`);
export { COIN };
