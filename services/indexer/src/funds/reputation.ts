import { dz, fundReputationEvents, funds, fundState, type Db } from "@listed/db";
import { anchorArgs, buildAnchor, replay, toWireEvent, type ReputationInput } from "@listed/reputation";
import type { FundStreamEvent } from "@listed/shared";
import { clockFromConfig } from "./snapshot";

type Obj = Record<string, unknown>;

type RevealRow = {
  fund: string;
  bell: number;
  at: Date | string;
  weights: { asset: string; bps: number }[];
  cash_bps: number;
};
type CrossRow = {
  holder: string;
  target: string;
  usd: number | null;
  coins: string;
  at: Date | string;
  bell: number | null;
  tx_hash: string;
  value_usd: number | null;
};
type QuarterRow = {
  season: number;
  quarter: number;
  closed_at: Date | string | null;
};
type PromiseRow = {
  fund: string;
  season: number;
  status: string;
  target_bps: number;
  user_return_bps: number | null;
  settled_at: Date | string | null;
};

export const REPUTATION_ANCHOR_KEY = "reputation_anchor";

const ms = (v: Date | string): number => (v instanceof Date ? v.getTime() : Date.parse(v));
const coinsNum = (raw: string): number => Number(raw) / 1e18;

export async function buildReputationInputs(db: Db): Promise<{ inputs: ReputationInput[]; dayMs: number; quarterMs: number }> {
  const [cfgRow] = await db.select().from(fundState).where(dz.eq(fundState.key, "config")).limit(1);
  const clock = clockFromConfig((cfgRow?.value as Obj | undefined) ?? null);
  const quarterMs = clock.quarterSecs * 1000;

  const reveals = await db.execute<RevealRow>(dz.sql`SELECT fund, bell, at, weights, cash_bps FROM fund_weights_history ORDER BY at, id`);
  const cross = await db.execute<CrossRow>(dz.sql`
    SELECT t.account AS holder, t.fund AS target, t.usd, t.coin_amount::text AS coins, t.at, NULL::int AS bell, t.tx_hash,
      (SELECT n.value_usd FROM fund_nav_history n WHERE n.fund = t.account AND n.at <= t.at ORDER BY n.at DESC LIMIT 1) AS value_usd
    FROM fund_trades t WHERE t.kind = 'cross_trade' ORDER BY t.at, t.id`);
  const quarters = await db.execute<QuarterRow>(dz.sql`SELECT season, quarter, closed_at FROM fund_quarters WHERE closed_at IS NOT NULL ORDER BY closed_at`);
  const promises = await db.execute<PromiseRow>(dz.sql`
    SELECT fund, season, status, target_bps, user_return_bps, settled_at FROM fund_promises WHERE status <> 'open' AND settled_at IS NOT NULL`);
  const holders = await db.select({ id: funds.id, supply: funds.supply, stake: funds.managerStake }).from(funds);

  const inputs: { at: number; order: number; input: ReputationInput }[] = [];
  let order = 0;
  for (const h of holders) {
    const supply = Number(h.supply);
    const stake = Number(h.stake);
    if (supply > 0) inputs.push({ at: 0, order: order++, input: { type: "holders", fund: h.id, at: 0, outsideBps: Math.max(0, Math.round((1 - stake / supply) * 10000)) } });
  }
  for (const r of reveals) {
    inputs.push({ at: ms(r.at), order: order++, input: { type: "rebalance", fund: r.fund, bell: r.bell, at: ms(r.at), weights: r.weights, cashBps: r.cash_bps } });
  }
  for (const c of cross) {
    const usd = Math.abs(Number(c.usd ?? 0));
    inputs.push({
      at: ms(c.at),
      order: order++,
      input: {
        type: "cross_trade",
        fund: c.holder,
        target: c.target,
        side: Number(c.usd ?? 0) >= 0 ? "buy" : "sell",
        usd,
        coins: Math.abs(coinsNum(c.coins)),
        fundValueUsd: Number(c.value_usd ?? 0),
        at: ms(c.at),
        bell: c.bell,
        id: c.tx_hash,
      },
    });
  }
  let prevClose: number | null = null;
  for (const q of quarters) {
    const end = ms(q.closed_at!);
    const start = prevClose ?? end - quarterMs;
    prevClose = end;
    const rets = await db.execute<{ fund: string; first: number | null; last: number | null }>(dz.sql`
      SELECT f.id AS fund,
        (SELECT nav FROM fund_nav_history n WHERE n.fund = f.id AND n.at <= ${new Date(start).toISOString()}::timestamptz ORDER BY n.at DESC LIMIT 1) AS first,
        (SELECT nav FROM fund_nav_history n WHERE n.fund = f.id AND n.at <= ${new Date(end).toISOString()}::timestamptz ORDER BY n.at DESC LIMIT 1) AS last
      FROM funds f`);
    const spy = await db.execute<{ first: number | null; last: number | null }>(dz.sql`
      SELECT (SELECT spy FROM fund_bells WHERE spy IS NOT NULL AND at <= ${new Date(start).toISOString()}::timestamptz ORDER BY at DESC LIMIT 1) AS first,
             (SELECT spy FROM fund_bells WHERE spy IS NOT NULL AND at <= ${new Date(end).toISOString()}::timestamptz ORDER BY at DESC LIMIT 1) AS last`);
    const bps = (a: number | null, b: number | null) => (a && b ? Math.round((b / a - 1) * 10000) : null);
    inputs.push({
      at: end,
      order: order++,
      input: {
        type: "quarter_close",
        quarter: q.quarter,
        at: end,
        spyReturnBps: bps(spy[0]?.first ?? null, spy[0]?.last ?? null),
        results: rets.map((r) => ({ fund: r.fund, returnBps: bps(r.first, r.last) })),
      },
    });
  }
  for (const p of promises) {
    inputs.push({
      at: ms(p.settled_at!),
      order: order++,
      input: { type: "promise", fund: p.fund, season: p.season, kept: p.status === "kept", targetBps: p.target_bps, actualBps: p.user_return_bps ?? 0, at: ms(p.settled_at!) },
    });
  }
  inputs.sort((a, b) => a.at - b.at || a.order - b.order);
  return { inputs: inputs.map((x) => x.input), dayMs: quarterMs, quarterMs };
}

export async function recomputeReputation(db: Db): Promise<FundStreamEvent[]> {
  const { inputs, dayMs, quarterMs } = await buildReputationInputs(db);
  if (!inputs.some((i) => i.type !== "holders")) return [];
  const { engine, changes, scores } = replay(inputs, { dayMs, quarterMs });
  const lastClosed = inputs.reduce<number | null>((q, i) => (i.type === "quarter_close" ? Math.max(q ?? -1, i.quarter) : q), null);
  const fresh: FundStreamEvent[] = [];
  await db.transaction(async (tx) => {
    for (const c of changes) {
      const res = await tx
        .insert(fundReputationEvents)
        .values({
          fund: c.fund,
          at: new Date(c.at),
          kind: c.kind,
          delta: c.delta,
          score: c.score,
          reason: c.reason,
          bell: c.bell,
          source: "computed",
          key: c.id,
        })
        .onConflictDoUpdate({
          target: fundReputationEvents.key,
          set: { delta: c.delta, score: c.score, reason: c.reason, at: new Date(c.at) },
        })
        .returning({ id: fundReputationEvents.id, inserted: dz.sql<boolean>`(xmax = 0)` });
      if (res[0]?.inserted) fresh.push({ topic: "reputation", event: toWireEvent(c) });
    }
    for (const { fund, score } of scores) {
      await tx.update(funds).set({ reputation: score }).where(dz.eq(funds.id, fund));
    }
    const anchor = buildAnchor(engine.snapshot(), lastClosed ?? 0);
    const value = { ...anchorArgs(anchor), leaves: anchor.leaves, quarterClosed: lastClosed, changes: changes.length, at: new Date().toISOString() };
    await tx
      .insert(fundState)
      .values({ key: REPUTATION_ANCHOR_KEY, value })
      .onConflictDoUpdate({ target: fundState.key, set: { value, updatedAt: new Date() } });
  });
  return fresh;
}
