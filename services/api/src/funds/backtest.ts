import { dz, type Db } from "@listed/db";
import {
  backtest,
  BACKTEST_LABEL,
  BACKTEST_START,
  BENCHMARK,
  mandateBasket,
  toDaily,
  type BacktestCandle,
  type BacktestPoint,
  type BasketWeight,
  type PriceBar,
} from "@listed/fundmath";
import { pgArray, tableExists } from "./common";

export type BacktestInterval = "1h" | "1d";

export interface FundBacktest {
  fund: string;
  from: string;
  interval: BacktestInterval;
  candles: BacktestCandle[];
  spy: BacktestPoint[];
  weights: BasketWeight[];
  weightsSource: "on-chain" | "mandate-default";
  label: string;
  updatedAt: string | null;
}

export function backtestStart(raw: string | undefined, nowMs = Date.now()): number {
  const floor = Date.parse(BACKTEST_START);
  const ms = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00Z`) : floor;
  if (!Number.isFinite(ms) || ms < floor) return floor;
  return ms >= nowMs ? floor : ms;
}

export function weightsFor(fundId: string, onChain: readonly BasketWeight[] | null | undefined): { weights: BasketWeight[]; source: FundBacktest["weightsSource"] } | null {
  const live = (onChain ?? []).filter((w) => w.bps > 0);
  if (live.length > 0) return { weights: live.map((w) => ({ asset: w.asset, bps: w.bps })), source: "on-chain" };
  const def = mandateBasket(fundId);
  return def ? { weights: def.map((w) => ({ ...w })), source: "mandate-default" } : null;
}

export async function hourlyBars(db: Db, assets: readonly string[], fromMs: number): Promise<{ bars: Map<string, PriceBar[]>; latest: number | null }> {
  const bars = new Map<string, PriceBar[]>();
  if (assets.length === 0 || !(await tableExists(db, "asset_bars_1h"))) return { bars, latest: null };

  const since = new Date(fromMs - 3 * 86_400_000).toISOString();
  const rows = await db.execute<{ asset: string; ts: string | Date; o: number | null; h: number | null; l: number | null; c: number }>(dz.sql`
    SELECT asset, ts, open_usd AS o, high_usd AS h, low_usd AS l, close_usd AS c FROM asset_bars_1h
    WHERE asset = ANY(${pgArray(assets)}::text[]) AND ts >= ${since}::timestamptz ORDER BY asset, ts`);
  let latest: number | null = null;
  for (const r of rows) {
    const t = new Date(r.ts).getTime();
    const list = bars.get(r.asset) ?? [];
    list.push({ t, o: r.o === null ? null : Number(r.o), h: r.h === null ? null : Number(r.h), l: r.l === null ? null : Number(r.l), c: Number(r.c) });
    bars.set(r.asset, list);
    if (latest === null || t > latest) latest = t;
  }
  return { bars, latest };
}

export async function fundBacktest(
  db: Db,
  fundId: string,
  onChain: readonly BasketWeight[] | null | undefined,
  opts: { from?: string; interval?: string; nowMs?: number } = {},
): Promise<FundBacktest | null> {
  const picked = weightsFor(fundId, onChain);
  if (!picked) return null;
  const nowMs = opts.nowMs ?? Date.now();
  const startMs = backtestStart(opts.from, nowMs);
  const interval: BacktestInterval = opts.interval === "1d" ? "1d" : "1h";
  const { bars, latest } = await hourlyBars(db, [...picked.weights.map((w) => w.asset), BENCHMARK.id], startMs);
  const hourly = backtest(picked.weights, bars, startMs, { endMs: nowMs, spy: bars.get(BENCHMARK.id) ?? [] });
  const out = interval === "1d" ? toDaily(hourly) : hourly;
  return {
    fund: fundId,
    from: new Date(startMs).toISOString(),
    interval,
    candles: out.candles,
    spy: out.spy,
    weights: picked.weights,
    weightsSource: picked.source,
    label: BACKTEST_LABEL,
    updatedAt: latest === null ? null : new Date(latest).toISOString(),
  };
}
