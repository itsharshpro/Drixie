import { existsSync } from "node:fs";
import { join } from "node:path";
import { dz, funds, fundState, repoRoot, type Db } from "@listed/db";
import {
  brainTierFor,
  FUND_COLORS,
  FUND_SEEDS,
  LAUNCH_NAV_USD,
  parseFundsClock,
  type BrainTier,
  type FundRiskCaps,
  type FundRow,
  type FundStatus,
  type Mandate,
  type SeasonClock,
  type SeedFundId,
} from "@listed/shared";

export type FundDbRow = typeof funds.$inferSelect;
type Obj = Record<string, unknown>;

export const MICRO = 1_000_000;
export const microToUsd = (v: string | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v) / MICRO);

export function rawToNum(raw: string | null | undefined, decimals = 18): number {
  if (!raw) return 0;
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).split(".")[0]!.padStart(decimals + 1, "0");
  const v = Number(`${digits.slice(0, digits.length - decimals)}.${digits.slice(digits.length - decimals, digits.length - decimals + 8)}`);
  return neg ? -v : v;
}
export const coinsNum = (raw: string | null | undefined) => rawToNum(raw, 18);
export const nearNum = (raw: string | null | undefined) => rawToNum(raw, 24);

export const pct = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a && b && a > 0 ? Math.round((b / a - 1) * 10000) / 100 : null;

export const round = (v: number, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;

export function pgArray(xs: readonly (string | number)[]): string {
  return `{${xs.map((x) => (typeof x === "number" ? String(x) : `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
}

export function fundsDeployed(network = process.env.NEAR_NETWORK?.trim() || "sandbox"): boolean {
  return existsSync(join(repoRoot(), ".data", `deployment.funds.${network}.json`));
}

const tableCache = new Map<string, { v: boolean; at: number }>();

export async function tableExists(db: Db, name: string): Promise<boolean> {
  const hit = tableCache.get(name);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const r = await db.execute<{ t: string | null }>(dz.sql`SELECT to_regclass(${`public.${name}`})::text AS t`);
  const v = !!r[0]?.t;
  tableCache.set(name, { v, at: Date.now() });
  return v;
}

export async function fundsConfig(db: Db): Promise<Obj | null> {
  const [r] = await db.select().from(fundState).where(dz.eq(fundState.key, "config")).limit(1);
  return (r?.value as Obj | undefined) ?? null;
}

export async function seasonClock(db: Db): Promise<SeasonClock | null> {
  const cfg = await fundsConfig(db);
  return cfg ? parseFundsClock(cfg) : null;
}

export async function gameRate(db: Db): Promise<number> {
  return (await seasonClock(db))?.gameUsdPerNear ?? 100;
}

export function poolPrice(poolNear: string, poolCoin: string, rate: number): number | null {
  const near = nearNum(poolNear);
  const coins = coinsNum(poolCoin);
  return near > 0 && coins > 0 ? (near * rate) / coins : null;
}

export function capsOf(f: FundDbRow): FundRiskCaps {
  const c = f.caps;
  return {
    startupCapBps: c.startupCapBps,
    basketCapBps: c.basketCapBps,
    indiaCapBps: c.indiaCapBps,
    cashMaxBps: c.cashMaxBps,
    minHoldingBps: c.minHoldingBps,
    maxHoldingBps: c.maxHoldingBps,
    maxStepBps: c.maxStepBps,
    maxSwapsPerBell: c.maxSwapsPerBell,
    turnoverAllowancePct: c.turnoverAllowanceBps / 100,
  };
}

export function mandateOf(f: FundDbRow): Mandate {
  const m = f.mandate.toLowerCase();
  if (m === "conservative" || m === "balanced" || m === "growth" || m === "contrarian" || m === "aggressive") return m;
  return FUND_SEEDS[f.id as SeedFundId]?.mandate ?? "balanced";
}

export function mandateLineOf(f: FundDbRow): string {
  return FUND_SEEDS[f.id as SeedFundId]?.mandateLine ?? f.mandate;
}

export const colorOf = (id: string): string => FUND_COLORS[id as SeedFundId] ?? "cobalt";

export function statusOf(f: FundDbRow): FundStatus {
  return f.status === "liquidated" || f.status === "autopilot" ? f.status : "active";
}

export function navSeasonStart(f: FundDbRow): number {
  const raw = (f.raw ?? {}) as Obj;
  const v = raw.nav_season_start ?? raw.nav_season_start_micro_usd;
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n / MICRO : LAUNCH_NAV_USD;
}

export interface FundExtras {

  spark: Map<string, number[]>;

  nav1d: Map<string, number>;
  outside: Map<string, { coins: number; holders: number }>;
  tier: Map<string, BrainTier>;
  spyNow: number | null;
  spySeasonStart: number | null;
}

export async function loadExtras(db: Db, rows: FundDbRow[], clock: SeasonClock | null, contract: string | null): Promise<FundExtras> {
  const spark = new Map<string, number[]>();
  const nav1d = new Map<string, number>();
  const outside = new Map<string, { coins: number; holders: number }>();
  const tier = new Map<string, BrainTier>();
  if (rows.length) {
    const sp = await db.execute<{ fund: string; nav: number }>(dz.sql`
      SELECT fund, nav FROM (
        SELECT fund, nav, at, row_number() OVER (PARTITION BY fund ORDER BY bell DESC) AS rn FROM fund_nav_history
      ) x WHERE rn <= 48 ORDER BY fund, at`);
    for (const r of sp) {
      const a = spark.get(r.fund) ?? [];
      a.push(Number(r.nav));
      spark.set(r.fund, a);
    }

    const daySecs = Math.min(86_400, Math.max(60, clock?.quarterSecs ?? 86_400));
    const d1 = await db.execute<{ fund: string; nav: number }>(dz.sql`
      SELECT DISTINCT ON (fund) fund, nav FROM fund_nav_history WHERE at <= now() - make_interval(secs => ${daySecs}) ORDER BY fund, at DESC`);
    for (const r of d1) nav1d.set(r.fund, Number(r.nav));
    const managers = rows.map((r) => r.manager).filter(Boolean);
    const excluded = [...managers, contract ?? "", "buyback"];
    const out = await db.execute<{ fund: string; coins: string; holders: number }>(dz.sql`
      SELECT fund, COALESCE(SUM(coins), 0)::text AS coins, COUNT(*) FILTER (WHERE coins > 0)::int AS holders
      FROM fund_balances WHERE NOT (account = ANY(${pgArray(excluded)}::text[])) GROUP BY fund`);
    for (const r of out) outside.set(r.fund, { coins: coinsNum(r.coins), holders: Number(r.holders) });
    const tiers = await db.execute<{ fund: string; tier: string }>(dz.sql`
      SELECT DISTINCT ON (fund) fund, tier FROM fund_brain_bills ORDER BY fund, at DESC`);
    for (const r of tiers) if (r.tier === "best" || r.tier === "primary" || r.tier === "small") tier.set(r.fund, r.tier);
  }
  let spyNow: number | null = null;
  let spySeasonStart: number | null = null;
  if (await tableExists(db, "asset_prices")) {
    const r = await db.execute<{ p: number }>(dz.sql`SELECT close_usd AS p FROM asset_prices WHERE asset = 'SPY' ORDER BY ts DESC LIMIT 1`);
    spyNow = r[0] ? Number(r[0].p) : null;
    if (clock?.seasonStartedAt) {
      const s = await db.execute<{ p: number }>(dz.sql`
        (SELECT close_usd AS p FROM asset_prices WHERE asset = 'SPY' AND ts <= ${clock.seasonStartedAt}::timestamptz ORDER BY ts DESC LIMIT 1)
        UNION ALL
        (SELECT close_usd AS p FROM asset_prices WHERE asset = 'SPY' AND ts > ${clock.seasonStartedAt}::timestamptz ORDER BY ts ASC LIMIT 1)
        LIMIT 1`);
      spySeasonStart = s[0] ? Number(s[0].p) : null;
    }
  }
  return { spark, nav1d, outside, tier, spyNow, spySeasonStart };
}

export function toFundRow(f: FundDbRow, x: FundExtras, clock: SeasonClock | null, rate: number): FundRow {
  const nav = f.lastBell === null && f.navMicro === "10000000" ? LAUNCH_NAV_USD : microToUsd(f.navMicro);
  const price = poolPrice(f.poolNear, f.poolCoin, rate);
  const supply = coinsNum(f.supply);
  const value = microToUsd(f.valueMicro) || supply * nav;
  const out = x.outside.get(f.id);
  const retSeason = pct(navSeasonStart(f), nav);
  const spySeason = pct(x.spySeasonStart, x.spyNow);
  return {
    id: f.id,
    name: f.name,
    mandate: mandateOf(f),
    mandateLine: mandateLineOf(f),
    color: colorOf(f.id),
    status: statusOf(f),
    nav: round(nav, 6),
    coinPrice: price === null ? null : round(price, 6),
    premium: price === null || nav <= 0 ? null : round((price / nav - 1) * 100, 2),
    ret1d: pct(x.nav1d.get(f.id), nav),
    retSeason,
    vsSpy: retSeason !== null && spySeason !== null ? round(retSeason - spySeason, 2) : null,
    aum: round(value, 2),
    outsideHolders: supply > 0 && out ? round(Math.min(100, (out.coins / supply) * 100), 2) : 0,
    holderCount: out?.holders ?? 0,
    reputation: round(f.reputation, 1),
    brainTier: x.tier.get(f.id) ?? brainTierFor(value),
    nextBellAt: clock?.nextBellAt ?? null,
    spark: x.spark.get(f.id) ?? [],
  };
}

export async function allFunds(db: Db): Promise<FundDbRow[]> {
  const rows = await db.select().from(funds);
  const order = Object.keys(FUND_SEEDS);
  return rows.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id.localeCompare(b.id);
  });
}

export async function fundsContract(db: Db): Promise<string | null> {
  const r = await db.execute<{ contract: string }>(dz.sql`SELECT contract FROM fund_cursor WHERE id = 'funds' LIMIT 1`);
  return r[0]?.contract ?? null;
}
