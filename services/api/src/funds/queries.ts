import {
  dz,
  fundCandles,
  fundCommits,
  fundCrossHoldings,
  fundNavHistory,
  fundNfts,
  fundPromises,
  fundReputationEvents,
  fundReputationScores,
  fundSeatAuctions,
  fundWeightsHistory,
  type Db,
} from "@listed/db";
import { assetById } from "@listed/fundmath";
import {
  REPUTATION_START,
  reputationBadge,
  type FundCandleInterval,
  type FundCandles,
  type FundDetail,
  type FundPromise,
  type FundsResponse,
  type Holding,
  type Move,
  type MovesPage,
  type NavRange,
  type NavSeries,
  type ReputationEventKind,
  type ReputationHistory,
  type SeasonClock,
  type WeightDiff,
} from "@listed/shared";
import { decodeCursor, encodeCursor, isIdCursor } from "../lib/cursor";
import {
  allFunds,
  capsOf,
  coinsNum,
  fundsContract,
  fundsDeployed,
  gameRate,
  loadExtras,
  microToUsd,
  nearNum,
  pct,
  poolPrice,
  round,
  seasonClock,
  tableExists,
  toFundRow,
  type FundDbRow, pgArray } from "./common";
import { latestPrices, pricesAt } from "./prices";

export async function listFunds(db: Db): Promise<FundsResponse> {
  const [rows, clock, rate, contract] = await Promise.all([allFunds(db), seasonClock(db), gameRate(db), fundsContract(db)]);
  const x = await loadExtras(db, rows, clock, contract);
  const [last] = await db.execute<{ bell: number | null; at: Date | null }>(dz.sql`SELECT max(bell) AS bell, max(at) AS at FROM fund_bells`);
  return {
    items: rows.map((f) => toFundRow(f, x, clock, rate)),
    spySeason: pct(x.spySeasonStart, x.spyNow),
    nextBellAt: clock?.nextBellAt ?? null,
    lastBell: last?.bell ?? null,
    waiting: rows.length === 0 && !fundsDeployed(),
    updatedAt: last?.at ? new Date(last.at).toISOString() : null,
  };
}

export const assetName = (id: string) => assetById(id)?.name ?? id;

export function diffWeights(prev: { asset: string; bps: number }[], next: { asset: string; bps: number }[]): WeightDiff[] {
  const before = new Map(prev.map((w) => [w.asset, w.bps]));
  const after = new Map(next.map((w) => [w.asset, w.bps]));
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  return ids
    .map((asset) => {
      const b = before.get(asset) ?? 0;
      const a = after.get(asset) ?? 0;
      const kind: WeightDiff["kind"] = b === 0 && a > 0 ? "enter" : a === 0 && b > 0 ? "exit" : a > b ? "up" : a < b ? "down" : "same";
      return { asset, name: assetName(asset), before: b, after: a, delta: a - b, kind };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || y.after - x.after);
}

type MoveRow = typeof fundWeightsHistory.$inferSelect;

export function toMove(r: MoveRow, fundName: string, note: string | null): Move {
  return {
    id: String(r.id),
    fund: r.fund,
    fundName,
    bell: r.bell,
    at: r.at.toISOString(),
    txHash: r.txHash,
    weights: r.weights,
    cashBps: r.cashBps,
    diffs: diffWeights(r.prevWeights, r.weights),
    turnoverPct: r.turnoverBps / 100,
    note: r.note ?? note,
    edition: r.edition,
  };
}

export async function movesPage(db: Db, fund: string | null, cursorRaw: string | undefined, limit: number): Promise<MovesPage> {
  const cur = decodeCursor(cursorRaw, isIdCursor);
  const conds = [];
  if (fund) conds.push(dz.eq(fundWeightsHistory.fund, fund));
  if (cur) conds.push(dz.lt(fundWeightsHistory.id, cur[0]));
  const rows = await db
    .select()
    .from(fundWeightsHistory)
    .where(conds.length ? dz.and(...conds) : undefined)
    .orderBy(dz.desc(fundWeightsHistory.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const names = new Map((await allFunds(db)).map((f) => [f.id, f.name]));
  const notes = await notesFor(db, page.map((r) => ({ fund: r.fund, bell: r.bell })));
  return {
    items: page.map((r) => toMove(r, names.get(r.fund) ?? r.fund, notes.get(`${r.fund}:${r.bell}`) ?? null)),
    nextCursor: rows.length > limit ? encodeCursor([page[page.length - 1]!.id]) : null,
  };
}

async function notesFor(db: Db, keys: { fund: string; bell: number }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!keys.length) return out;
  const funds = [...new Set(keys.map((k) => k.fund))];
  const bells = [...new Set(keys.map((k) => k.bell))];
  const rows = await db.execute<{ fund: string; bell: number; note: string }>(dz.sql`
    SELECT fund, bell, note FROM fund_notes WHERE fund = ANY(${pgArray(funds)}::text[]) AND bell = ANY(${pgArray(bells)}::int[])`);
  for (const r of rows) out.set(`${r.fund}:${r.bell}`, r.note);
  return out;
}

function entryBells(history: MoveRow[], assets: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of assets) {
    let since: number | null = null;
    for (const r of history) {
      if (r.weights.some((w) => w.asset === a && w.bps > 0)) since = r.bell;
      else break;
    }
    if (since !== null) out.set(a, since);
  }
  return out;
}

async function bellTime(db: Db, bell: number): Promise<Date | null> {
  const r = await db.execute<{ at: Date }>(dz.sql`SELECT at FROM fund_bells WHERE bell <= ${bell} ORDER BY bell DESC LIMIT 1`);
  return r[0] ? new Date(r[0].at) : null;
}

async function holdingsOf(db: Db, f: FundDbRow): Promise<Holding[]> {
  const ids = f.weights.map((w) => w.asset);
  if (!ids.length) return [];
  const history = await db
    .select()
    .from(fundWeightsHistory)
    .where(dz.eq(fundWeightsHistory.fund, f.id))
    .orderBy(dz.desc(fundWeightsHistory.id))
    .limit(400);
  const since = entryBells(history, ids);
  const latest = await latestPrices(db, ids);
  const lastBellAt = f.lastBell !== null ? await bellTime(db, Math.max(0, f.lastBell - 1)) : null;
  const p1bell = lastBellAt ? await pricesAt(db, ids, lastBellAt) : new Map<string, number>();
  const p1d = await pricesAt(db, ids, new Date(Date.now() - 86_400_000));
  const entryTimes = new Map<number, Date | null>();
  for (const b of new Set(since.values())) entryTimes.set(b, await bellTime(db, b));
  const entryPrices = new Map<string, number>();
  for (const [asset, bell] of since) {
    const t = entryTimes.get(bell);
    if (!t) continue;
    const p = (await pricesAt(db, [asset], t)).get(asset);
    if (p) entryPrices.set(asset, p);
  }
  return f.weights.map((w) => {
    const a = assetById(w.asset);
    const price = latest.get(w.asset)?.usd ?? null;
    return {
      asset: w.asset,
      name: a?.name ?? w.asset,
      basket: a?.basket ?? "startups",
      kind: a?.kind ?? "startup",
      estimated: a?.kind === "startup",
      bps: w.bps,
      price,
      ret1bell: pct(p1bell.get(w.asset), price),
      ret1d: pct(p1d.get(w.asset), price),
      retSinceEntry: pct(entryPrices.get(w.asset), price),
      sinceBell: since.get(w.asset) ?? null,
    };
  });
}

async function promiseOf(db: Db, f: FundDbRow, clock: SeasonClock | null, nav: number, navStart: number): Promise<FundPromise | null> {
  const rows = await db.select().from(fundPromises).where(dz.eq(fundPromises.fund, f.id)).orderBy(dz.desc(fundPromises.season)).limit(1);
  const p = rows[0];
  if (!p) return null;
  return {
    season: p.season,
    targetBps: p.targetBps,
    bondBps: p.bondBps,
    bondUsd: p.bondCoins ? round(coinsNum(p.bondCoins) * nav, 2) : null,
    progressPct: clock && p.season === clock.seasonIndex ? pct(navStart, nav) : p.userReturnBps !== null ? p.userReturnBps / 100 : null,
    status: p.status === "kept" || p.status === "missed" ? p.status : "open",
    compensation: p.compensation,
  };
}

async function brainBills(db: Db, fund: string, clock: SeasonClock | null): Promise<{ season: number; quarter: number }> {
  const seasonStart = clock?.seasonStartedAt ? new Date(clock.seasonStartedAt) : new Date(0);
  const quarterStart = clock?.quarterEndsAt ? new Date(Date.parse(clock.quarterEndsAt) - clock.quarterSecs * 1000) : new Date(0);
  const [r] = await db.execute<{ season: number | null; quarter: number | null; n: number }>(dz.sql`
    SELECT COALESCE(SUM(usd) FILTER (WHERE at >= ${seasonStart.toISOString()}::timestamptz), 0)::float8 AS season,
           COALESCE(SUM(usd) FILTER (WHERE at >= ${quarterStart.toISOString()}::timestamptz), 0)::float8 AS quarter, COUNT(*)::int AS n
    FROM fund_brain_bills WHERE fund = ${fund}`);
  if (r && r.n > 0) return { season: round(Number(r.season), 2), quarter: round(Number(r.quarter), 2) };

  const mult = Number(process.env.COMPUTE_MULTIPLIER ?? 20000) || 20000;
  const [u] = await db.execute<{ season: number | null; quarter: number | null }>(dz.sql`
    SELECT COALESCE(SUM(cost_usd) FILTER (WHERE at >= ${seasonStart.toISOString()}::timestamptz), 0)::float8 AS season,
           COALESCE(SUM(cost_usd) FILTER (WHERE at >= ${quarterStart.toISOString()}::timestamptz), 0)::float8 AS quarter
    FROM ai_usage WHERE service = 'agents' AND lower(company) = ${fund}`);
  return { season: round(Number(u?.season ?? 0) * mult, 2), quarter: round(Number(u?.quarter ?? 0) * mult, 2) };
}

export async function fundDetail(db: Db, id: string): Promise<FundDetail | null> {
  const rows = await allFunds(db);
  const f = rows.find((r) => r.id === id);
  if (!f) return null;
  const [clock, rate, contract] = await Promise.all([seasonClock(db), gameRate(db), fundsContract(db)]);
  const x = await loadExtras(db, [f], clock, contract);
  const row = toFundRow(f, x, clock, rate);
  const raw = (f.raw ?? {}) as Record<string, unknown>;
  const navStart = row.retSeason !== null ? row.nav / (1 + row.retSeason / 100) : row.nav;
  const [holdings, promise, bills, cross, seatNft, auction, commit] = await Promise.all([
    holdingsOf(db, f),
    promiseOf(db, f, clock, row.nav, navStart),
    brainBills(db, f.id, clock),
    db.select().from(fundCrossHoldings).where(dz.eq(fundCrossHoldings.holder, f.id)),
    db
      .select()
      .from(fundNfts)
      .where(dz.and(dz.eq(fundNfts.kind, "seat"), dz.eq(fundNfts.fund, f.id), dz.eq(fundNfts.burned, false)))
      .limit(1),
    db.select().from(fundSeatAuctions).where(dz.eq(fundSeatAuctions.fund, f.id)).limit(1),
    db
      .select()
      .from(fundCommits)
      .where(dz.and(dz.eq(fundCommits.fund, f.id), dz.eq(fundCommits.revealed, false)))
      .orderBy(dz.desc(fundCommits.bell))
      .limit(1),
  ]);
  const targets = new Map(rows.map((r) => [r.id, r]));
  const seatFees = await db.execute<{ s: string | null }>(dz.sql`SELECT COALESCE(SUM(amount), 0)::text AS s FROM fund_fees WHERE fund = ${f.id} AND kind = 'seat'`);
  const turnoverQ = typeof raw.turnover_q_bps === "number" ? raw.turnover_q_bps / 100 : await quarterTurnover(db, f.id, clock);
  const a = auction[0];
  const pool = poolPrice(f.poolNear, f.poolCoin, rate);
  const vol = await db.execute<{ v: number | null }>(dz.sql`
    SELECT COALESCE(SUM(abs(usd)), 0)::float8 AS v FROM fund_trades WHERE fund = ${f.id} AND kind IN ('pool_buy','pool_sell','cross_trade','buyback') AND at > now() - interval '24 hours'`);
  return {
    ...row,
    manager: f.manager,
    account: f.manager || null,
    caps: capsOf(f),
    supply: f.supply,
    supplyNum: coinsNum(f.supply),
    managerStake: f.managerStake,
    valueUsd: row.aum,
    cashBps: f.cashBps,
    holdings,
    promise,
    dna: f.dna && Object.keys(f.dna).length ? { risk: f.dna.risk ?? 0, patience: f.dna.patience ?? 0, greed: f.dna.greed ?? 0, loyalty: f.dna.loyalty ?? 0, smarts: f.dna.smarts ?? 0 } : null,
    dnaCommitted: f.dnaCommitted || !!raw.dna,
    brainBillSeason: bills.season,
    brainBillQuarter: bills.quarter,
    turnoverQuarterPct: round(turnoverQ, 2),
    pool: f.poolNear !== "0" || f.poolCoin !== "0" ? { nearReserve: f.poolNear, coinReserve: f.poolCoin, price: pool, feeBps: f.poolFeeBps, volume24hUsd: round(Number(vol[0]?.v ?? 0), 2) } : null,
    seat: {
      tokenId: seatNft[0]?.tokenId ?? null,
      owner: seatNft[0]?.owner ?? a?.winner ?? null,
      feesEarned: seatFees[0]?.s ?? "0",
      auction: a
        ? { fund: f.id, open: a.open, highBidder: a.highBidder, highBid: a.highBid, endsAt: a.endsAt ? a.endsAt.toISOString() : null }
        : null,
    },
    crossHoldings: cross.map((c) => {
      const t = targets.get(c.target);
      const price = t ? poolPrice(t.poolNear, t.poolCoin, rate) : null;
      const supply = t ? coinsNum(t.supply) : 0;
      const coins = coinsNum(c.coins);
      return { holder: c.holder, target: c.target, coins: c.coins, coinsNum: coins, valueUsd: price === null ? null : round(coins * price, 2), pctOfTarget: supply > 0 ? round((coins / supply) * 100, 2) : 0 };
    }),
    pendingCommit: commit[0] ? { bell: commit[0].bell, at: commit[0].at.toISOString() } : null,
    lastNote: f.lastNote,
    createdAt: f.createdAt ? f.createdAt.toISOString() : null,
  };
}

async function quarterTurnover(db: Db, fund: string, clock: SeasonClock | null): Promise<number> {
  const start = clock?.quarterEndsAt ? new Date(Date.parse(clock.quarterEndsAt) - clock.quarterSecs * 1000) : new Date(Date.now() - 86_400_000);
  const r = await db.execute<{ t: number | null }>(dz.sql`
    SELECT COALESCE(SUM(turnover_bps), 0)::float8 AS t FROM fund_weights_history WHERE fund = ${fund} AND at >= ${start.toISOString()}::timestamptz AND prev_weights <> '[]'::jsonb`);
  return Number(r[0]?.t ?? 0) / 100;
}

const RANGE_MS: Record<NavRange, number | null> = { "1D": 86_400_000, "4D": 4 * 86_400_000, SEASON: null, ALL: null };

export async function navSeries(db: Db, id: string, range: NavRange): Promise<NavSeries> {
  let since = new Date(0);
  const ms = RANGE_MS[range];
  if (ms) since = new Date(Date.now() - ms);
  else if (range === "SEASON") {
    const clock = await seasonClock(db);
    if (clock?.seasonStartedAt) since = new Date(clock.seasonStartedAt);
  }
  const rows = await db
    .select()
    .from(fundNavHistory)
    .where(dz.and(dz.eq(fundNavHistory.fund, id), dz.gte(fundNavHistory.at, since)))
    .orderBy(dz.asc(fundNavHistory.bell))
    .limit(5000);

  const spyFill = new Map<number, number>();
  if (rows.some((r) => r.spy === null) && (await tableExists(db, "asset_prices"))) {
    const missing = rows.filter((r) => r.spy === null).slice(-500);
    for (const r of missing) {
      const p = await db.execute<{ p: number }>(dz.sql`SELECT close_usd AS p FROM asset_prices WHERE asset = 'SPY' AND ts <= ${r.at.toISOString()}::timestamptz ORDER BY ts DESC LIMIT 1`);
      if (p[0]) spyFill.set(r.bell, Number(p[0].p));
    }
  }
  const first = rows[0];
  const nav0 = first?.nav ?? null;
  let spy0: number | null = null;
  const points = rows.map((r) => {
    const spy = r.spy ?? spyFill.get(r.bell) ?? null;
    if (spy0 === null && spy !== null) spy0 = spy;
    return {
      bell: r.bell,
      t: r.at.toISOString(),
      nav: round(r.nav, 6),
      valueUsd: round(r.valueUsd, 2),
      ret: nav0 ? round((r.nav / nav0 - 1) * 100, 3) : 0,
      spy: spy !== null && spy0 ? round((spy / spy0 - 1) * 100, 3) : null,
    };
  });
  return { fund: id, range, points };
}

export async function coinCandles(db: Db, id: string, interval: FundCandleInterval, limit: number): Promise<FundCandles> {
  const rows = await db
    .select()
    .from(fundCandles)
    .where(dz.and(dz.eq(fundCandles.fund, id), dz.eq(fundCandles.interval, interval)))
    .orderBy(dz.desc(fundCandles.bucket))
    .limit(limit);
  return {
    fund: id,
    interval,
    candles: rows.reverse().map((r) => ({ t: r.bucket.toISOString(), o: r.open, h: r.high, l: r.low, c: r.close, v: round(r.volumeUsd, 2) })),
  };
}

const KINDS = new Set<ReputationEventKind>([
  "turnover_excess",
  "flip_flop",
  "pump_dump",
  "broken_deal",
  "missed_promise",
  "front_running",
  "low_churn",
  "beat_spy",
  "honoured_deal",
  "kept_promise",
  "anchor",
]);

export async function reputationHistory(db: Db, f: FundDbRow): Promise<ReputationHistory> {
  const events = await db
    .select()
    .from(fundReputationEvents)
    .where(dz.eq(fundReputationEvents.fund, f.id))
    .orderBy(dz.asc(fundReputationEvents.at), dz.asc(fundReputationEvents.id))
    .limit(2000);
  const anchors = await db
    .select()
    .from(fundReputationScores)
    .where(dz.and(dz.eq(fundReputationScores.fund, f.id), dz.eq(fundReputationScores.anchored, true)))
    .orderBy(dz.desc(fundReputationScores.at))
    .limit(1);
  const start = f.createdAt ?? events[0]?.at ?? null;
  const points = [
    ...(start ? [{ t: start.toISOString(), score: REPUTATION_START }] : []),
    ...events.map((e) => ({ t: e.at.toISOString(), score: e.score })),
  ];
  return {
    fund: f.id,
    score: round(f.reputation, 1),
    badge: reputationBadge(f.reputation),
    points,
    events: events
      .slice()
      .reverse()
      .map((e) => ({
        id: e.key,
        fund: e.fund,
        at: e.at.toISOString(),
        kind: KINDS.has(e.kind as ReputationEventKind) ? (e.kind as ReputationEventKind) : "anchor",
        delta: e.delta,
        score: e.score,
        reason: e.reason,
        bell: e.bell,
      })),
    anchoredAt: anchors[0]?.at.toISOString() ?? null,
    anchoredScore: anchors[0]?.score ?? null,
  };
}

export { nearNum, microToUsd };
