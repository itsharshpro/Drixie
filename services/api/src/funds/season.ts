import { dz, fundNfts, fundPromises, fundQuarters, fundSeasons, type Db } from "@listed/db";
import { fundScore, rankFunds } from "@listed/fundmath";
import { isHouseAccount, type FundRow, type FundScoreRow, type QuarterResult, type SeasonResponse, type UserScoreRow } from "@listed/shared";
import { handleOf } from "../lib/player";
import { allFunds, coinsNum, fundsContract, microToUsd, pct, round, seasonClock, pgArray } from "./common";
import { listFunds } from "./queries";
import { toFundNft } from "./nft";

export async function userLeaderboard(db: Db, root: string, opts: { limit: number; includeHouse: boolean }): Promise<UserScoreRow[]> {
  const funds = await allFunds(db);
  const contract = await fundsContract(db);
  const excluded = [...funds.map((f) => f.manager).filter(Boolean), contract ?? "", "buyback", ...funds.map((f) => f.id)];
  const rows = await db.execute<{ account: string; fund: string; coins: string; cost_usd: number }>(dz.sql`
    SELECT account, fund, coins::text AS coins, cost_usd FROM fund_balances WHERE NOT (account = ANY(${pgArray(excluded)}::text[]))`);
  const nav = new Map(funds.map((f) => [f.id, microToUsd(f.navMicro)]));
  const agg = new Map<string, { value: number; cost: number }>();
  for (const r of rows) {
    const a = agg.get(r.account) ?? { value: 0, cost: 0 };
    a.value += coinsNum(r.coins) * (nav.get(r.fund) ?? 0);
    a.cost += Number(r.cost_usd);
    agg.set(r.account, a);
  }
  return [...agg.entries()]
    .filter(([account, a]) => a.cost > 0 && (opts.includeHouse || !isHouseAccount(account)))
    .map(([account, a]) => ({ account, a, ret: (a.value / a.cost - 1) * 100 }))
    .sort((x, y) => y.ret - x.ret || y.a.value - x.a.value)
    .slice(0, opts.limit)
    .map((x, i) => ({
      rank: i + 1,
      account: x.account,
      handle: handleOf(x.account, root),
      isHouse: isHouseAccount(x.account),
      retPct: round(x.ret, 2),
      valueUsd: round(x.a.value, 2),
      costUsd: round(x.a.cost, 2),
    }));
}

export async function fundLeaderboard(db: Db, rows: FundRow[], spySeason: number | null, season: number | null): Promise<FundScoreRow[]> {
  const promises = season !== null ? await db.select().from(fundPromises).where(dz.eq(fundPromises.season, season)) : [];
  const kept = new Map(promises.map((p) => [p.fund, p.status === "kept" ? true : p.status === "missed" ? false : null]));
  const [seasonRow] = season !== null ? await db.select().from(fundSeasons).where(dz.eq(fundSeasons.season, season)).limit(1) : [];
  const startValues = (seasonRow?.startValues ?? {}) as Record<string, number>;
  const scored = rows.map((f) => {
    const outsideNow = (f.outsideHolders / 100) * f.aum;
    const s = fundScore({
      retSeasonPct: f.retSeason,
      spySeasonPct: spySeason,
      outsideStartUsd: startValues[f.id] ?? 0,
      outsideNowUsd: outsideNow,
      reputation: f.reputation,
      promiseKept: kept.get(f.id) ?? null,
    });
    return { id: f.id, f, s, score: s.score, reputation: f.reputation };
  });
  return rankFunds(scored).map((r) => ({
    rank: r.rank,
    fund: r.f.id,
    name: r.f.name,
    score: r.s.score,
    retSeason: r.f.retSeason,
    vsSpy: r.s.vsSpy,
    outsideGrowthPct: r.s.outsideGrowthPct,
    reputation: r.f.reputation,
    promiseKept: kept.get(r.f.id) ?? null,
    parts: r.s.parts,
  }));
}

async function quarterResults(db: Db, season: number | null, spyAt: (at: Date) => Promise<number | null>): Promise<QuarterResult[]> {
  const rows = await db
    .select()
    .from(fundQuarters)
    .where(season !== null ? dz.eq(fundQuarters.season, season) : undefined)
    .orderBy(dz.asc(fundQuarters.season), dz.asc(fundQuarters.quarter))
    .limit(64);
  const out: QuarterResult[] = [];
  let prev: Date | null = null;
  for (const q of rows) {
    const end = q.closedAt;
    if (!end) continue;
    const start: Date = prev ?? new Date(0);
    prev = end;
    const navs = await db.execute<{ fund: string; first: number | null; last: number | null }>(dz.sql`
      SELECT f.id AS fund,
        COALESCE((SELECT nav FROM fund_nav_history n WHERE n.fund = f.id AND n.at <= ${start.toISOString()}::timestamptz ORDER BY n.at DESC LIMIT 1),
                 (SELECT nav FROM fund_nav_history n WHERE n.fund = f.id ORDER BY n.at ASC LIMIT 1)) AS first,
        (SELECT nav FROM fund_nav_history n WHERE n.fund = f.id AND n.at <= ${end.toISOString()}::timestamptz ORDER BY n.at DESC LIMIT 1) AS last
      FROM funds f`);
    const spy = pct(await spyAt(start), await spyAt(end));
    const returns = navs.map((n) => {
      const ret = pct(n.first, n.last);
      return { fund: n.fund, ret, vsSpy: ret !== null && spy !== null ? round(ret - spy, 2) : null };
    });
    const best = returns.filter((r) => r.ret !== null).sort((a, b) => b.ret! - a.ret!)[0];
    out.push({ season: q.season, quarter: q.quarter, closedAt: end.toISOString(), winner: q.winner ?? best?.fund ?? null, returns, spy });
  }
  return out;
}

export async function seasonView(db: Db, root: string, includeHouse: boolean): Promise<SeasonResponse> {
  const [clock, list] = await Promise.all([seasonClock(db), listFunds(db)]);

  const season = clock?.seasonIndex ?? null;
  const spyAt = async (at: Date): Promise<number | null> => {
    const r = await db.execute<{ spy: number | null }>(dz.sql`SELECT spy FROM fund_bells WHERE spy IS NOT NULL AND at <= ${at.toISOString()}::timestamptz ORDER BY at DESC LIMIT 1`);
    return r[0]?.spy ?? null;
  };
  const [funds, users, quarters, trophies, seasonRow] = await Promise.all([
    fundLeaderboard(db, list.items, list.spySeason, season),
    userLeaderboard(db, root, { limit: 50, includeHouse }),
    quarterResults(db, season, spyAt),
    db.select().from(fundNfts).where(dz.and(dz.eq(fundNfts.kind, "trophy"), dz.eq(fundNfts.burned, false))).orderBy(dz.desc(fundNfts.mintedAt)),
    season !== null ? db.select().from(fundSeasons).where(dz.eq(fundSeasons.season, season)).limit(1) : Promise.resolve([]),
  ]);
  return {
    clock,
    funds,
    users,
    quarters,
    trophies: trophies.map(toFundNft),
    dnaRevealed: seasonRow[0]?.dnaRevealed ?? false,
    settled: !!seasonRow[0]?.settledAt,
  };
}
