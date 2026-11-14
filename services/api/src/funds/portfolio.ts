import { dz, fundBalances, fundNfts, fundOrders, fundPromises, type Db } from "@listed/db";
import type { FundBadge, FundOrder, FundPortfolio, FundPosition, FundPromise } from "@listed/shared";
import { allFunds, coinsNum, microToUsd, round, seasonClock } from "./common";
import { nftImageUrl } from "./nft";

type OrderRow = typeof fundOrders.$inferSelect;

export function toOrder(o: OrderRow): FundOrder {
  return {
    id: o.id,
    fund: o.fund,
    account: o.account,
    side: o.side === "redeem" ? "redeem" : "subscribe",
    status: o.status === "filled" || o.status === "cancelled" ? o.status : "queued",
    amount: o.amount,
    amountUsd: round(o.amountUsd, 2),
    filled: o.filled,
    fillNav: o.fillNavMicro ? round(microToUsd(o.fillNavMicro), 6) : null,
    fillBell: o.fillBell,
    queuedAt: o.queuedAt.toISOString(),
    filledAt: o.filledAt ? o.filledAt.toISOString() : null,
    txHash: o.fillTxHash ?? o.txHash,
  };
}

const BADGE_KINDS = new Set(["season_winner", "black_swan", "early_backer", "kept_faith"]);

export async function fundPortfolio(db: Db, account: string): Promise<FundPortfolio> {
  const [funds, clock] = await Promise.all([allFunds(db), seasonClock(db)]);
  const byId = new Map(funds.map((f) => [f.id, f]));
  const balances = await db.select().from(fundBalances).where(dz.eq(fundBalances.account, account));
  const quarterMs = (clock?.quarterSecs ?? 86400) * 1000;
  const positions: FundPosition[] = [];
  for (const b of balances) {
    const f = byId.get(b.fund);
    const coins = coinsNum(b.coins);
    if (!f || coins <= 0) continue;
    const nav = microToUsd(f.navMicro);
    const value = coins * nav;
    const held = b.firstAt ? Date.now() - b.firstAt.getTime() : 0;
    positions.push({
      fund: f.id,
      fundName: f.name,
      coins: b.coins,
      coinsNum: coins,
      nav: round(nav, 6),
      valueUsd: round(value, 2),
      costUsd: round(b.costUsd, 2),
      pnlUsd: round(value - b.costUsd, 2),
      pnlPct: b.costUsd > 0 ? round((value / b.costUsd - 1) * 100, 2) : null,
      since: b.firstAt ? b.firstAt.toISOString() : null,
      exitLoadPct: f.reputation < 25 || f.status === "liquidated" || held >= quarterMs ? 0 : 1,
    });
  }
  positions.sort((a, b) => b.valueUsd - a.valueUsd);
  const orders = await db.select().from(fundOrders).where(dz.eq(fundOrders.account, account)).orderBy(dz.desc(fundOrders.queuedAt)).limit(50);
  const badges = await db
    .select()
    .from(fundNfts)
    .where(dz.and(dz.eq(fundNfts.owner, account), dz.eq(fundNfts.kind, "badge"), dz.eq(fundNfts.burned, false)))
    .orderBy(dz.desc(fundNfts.mintedAt));
  const promiseFunds = positions.map((p) => p.fund);
  const promises = promiseFunds.length
    ? await db
        .select()
        .from(fundPromises)
        .where(dz.inArray(fundPromises.fund, promiseFunds))
        .orderBy(dz.desc(fundPromises.season))
    : [];
  const seenPromise = new Set<string>();
  const promiseList: { fund: string; promise: FundPromise }[] = [];
  for (const p of promises) {
    if (seenPromise.has(p.fund)) continue;
    seenPromise.add(p.fund);
    const f = byId.get(p.fund);
    const nav = f ? microToUsd(f.navMicro) : 0;
    promiseList.push({
      fund: p.fund,
      promise: {
        season: p.season,
        targetBps: p.targetBps,
        bondBps: p.bondBps,
        bondUsd: p.bondCoins ? round(coinsNum(p.bondCoins) * nav, 2) : null,
        progressPct: p.userReturnBps !== null ? p.userReturnBps / 100 : null,
        status: p.status === "kept" || p.status === "missed" ? p.status : "open",
        compensation: p.compensation,
      },
    });
  }
  const totalValue = positions.reduce((s, p) => s + p.valueUsd, 0);
  const totalCost = positions.reduce((s, p) => s + p.costUsd, 0);
  return {
    account,
    totalValueUsd: round(totalValue, 2),
    totalCostUsd: round(totalCost, 2),
    pnlUsd: round(totalValue - totalCost, 2),
    pnlPct: totalCost > 0 ? round((totalValue / totalCost - 1) * 100, 2) : null,
    positions,
    pendingOrders: orders.filter((o) => o.status === "queued").map(toOrder),
    recentOrders: orders.filter((o) => o.status !== "queued").slice(0, 20).map(toOrder),
    badges: badges.map(
      (b): FundBadge => ({
        tokenId: b.tokenId,
        kind: (BADGE_KINDS.has(b.badgeKind ?? "") ? b.badgeKind : "early_backer") as FundBadge["kind"],
        title: b.title,
        fund: b.fund,
        season: b.season,
        mintedAt: b.mintedAt.toISOString(),
        imageUrl: nftImageUrl(b.tokenId),
      }),
    ),
    promises: promiseList,
  };
}
