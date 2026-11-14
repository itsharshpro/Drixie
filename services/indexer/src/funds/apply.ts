import {
  dz,
  fundBells,
  fundCommits,
  fundCrossHoldings,
  fundEvents,
  fundFees,
  fundNavHistory,
  fundNfts,
  fundNotes,
  fundOrders,
  fundPromises,
  fundQuarters,
  fundReputationScores,
  fundSeasons,
  fundSeatAuctions,
  funds,
  fundTrades,
  fundWeightsHistory,
  type FundCaps,
  type Tx,
} from "@listed/db";
import { FUND_SEEDS, type FundStreamEvent, type Move, type SeedFundId } from "@listed/shared";
import { coinsToNum, decodeFundEvent, eventTags, microToUsd, turnoverBps, weightsOf, yoctoToNear, type FundRecord, type Weight } from "./decode";
import type { NearEvent } from "../parse";

type Obj = Record<string, unknown>;

export interface FundEventCtx {
  receiptId: string;
  logIndex: number;
  txHash: string;
  blockHeight: number;
  at: Date;
  signer: string;
}

export interface FundViews {
  nftToken(tokenId: string): Promise<Obj | null>;
}

export interface ApplyOut {
  stream: FundStreamEvent[];

  balances: Set<string>;

  fundsTouched: Set<string>;

  candles: { fund: string; at: Date; price: number; usd: number }[];
}

export const newApplyOut = (): ApplyOut => ({ stream: [], balances: new Set(), fundsTouched: new Set(), candles: [] });

export interface ApplyEnv {
  tx: Tx;
  views: FundViews;
  out: ApplyOut;
  gameUsdPerNear: number;
  tokenToFund: (tokenId: string) => string;

  quarters: number;

  spyAt: (at: Date) => Promise<number | null>;
}

const CAP_DEFAULTS = { indiaCapBps: 3000, cashMaxBps: 2000, minHoldingBps: 200, maxHoldingBps: 2500, maxStepBps: 1000, maxSwapsPerBell: 2 };

export function capsFrom(fund: string, d: Obj): FundCaps {
  const seed = FUND_SEEDS[fund as SeedFundId];
  const num = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    }
    return null;
  };
  return {
    startupCapBps: num("startup_cap_bps", "startupCapBps") ?? seed?.startupCapBps ?? 2000,
    basketCapBps: num("basket_cap_bps", "basketCapBps") ?? seed?.basketCapBps ?? 3500,
    indiaCapBps: num("india_cap_bps") ?? CAP_DEFAULTS.indiaCapBps,
    cashMaxBps: num("cash_max_bps", "max_cash_bps") ?? CAP_DEFAULTS.cashMaxBps,
    minHoldingBps: num("min_holding_bps", "min_weight_bps") ?? CAP_DEFAULTS.minHoldingBps,
    maxHoldingBps: num("max_holding_bps", "max_weight_bps") ?? CAP_DEFAULTS.maxHoldingBps,
    maxStepBps: num("max_step_bps") ?? CAP_DEFAULTS.maxStepBps,
    maxSwapsPerBell: num("max_swaps_per_bell", "max_swaps") ?? CAP_DEFAULTS.maxSwapsPerBell,
    turnoverAllowanceBps: num("turnover_allowance_bps", "turnover_bps") ?? (seed ? seed.turnoverAllowancePct * 100 : 8000),
  };
}

export async function applyFundEvent(env: ApplyEnv, ctx: FundEventCtx, ev: NearEvent): Promise<boolean> {
  const items = Array.isArray(ev.data) ? (ev.data as Obj[]) : [ev.data as Obj];
  const first = (items[0] ?? {}) as Obj;
  const tags = eventTags(first);
  const ins = await env.tx
    .insert(fundEvents)
    .values({
      event: ev.standard === "drixie" ? ev.event : `${ev.standard}:${ev.event}`,
      fund: tags.fund,
      account: tags.account,
      data: (Array.isArray(ev.data) ? { items: ev.data } : (ev.data as Obj)) ?? {},
      at: ctx.at,
      blockHeight: ctx.blockHeight,
      txHash: ctx.txHash,
      receiptId: ctx.receiptId,
      logIndex: ctx.logIndex,
    })
    .onConflictDoNothing()
    .returning({ id: fundEvents.id });
  if (!ins.length) return false;
  for (const rec of decodeFundEvent(ev)) await applyRecord(env, ctx, rec);
  return true;
}

async function fundRow(tx: Tx, id: string) {
  const [r] = await tx.select().from(funds).where(dz.eq(funds.id, id)).limit(1);
  return r ?? null;
}

const pairKey = (fund: string, account: string) => `${fund}\u0000${account}`;

async function addCost(tx: Tx, fund: string, account: string, usd: number, at: Date): Promise<void> {
  if (!fund || !account || !Number.isFinite(usd)) return;
  await tx.execute(dz.sql`
    INSERT INTO fund_balances (fund, account, coins, cost_usd, first_at, updated_at)
    VALUES (${fund}, ${account}, 0, ${usd}, ${at.toISOString()}::timestamptz, now())
    ON CONFLICT (fund, account) DO UPDATE SET cost_usd = fund_balances.cost_usd + EXCLUDED.cost_usd,
      first_at = COALESCE(fund_balances.first_at, EXCLUDED.first_at), updated_at = now()`);
}

async function lastNav(tx: Tx, fund: string): Promise<number | null> {
  const f = await fundRow(tx, fund);
  return f ? microToUsd(f.navMicro) : null;
}

export async function applyRecord(env: ApplyEnv, ctx: FundEventCtx, rec: FundRecord): Promise<void> {
  const { tx, out } = env;
  const rate = env.gameUsdPerNear;
  switch (rec.kind) {
    case "fund_created": {
      if (!rec.fund) return;
      const seed = FUND_SEEDS[rec.fund as SeedFundId];
      const caps = capsFrom(rec.fund, rec.caps);
      const d = rec.data;
      const weights = weightsOf(d.weights);
      const cashBps = typeof d.cash_bps === "number" ? d.cash_bps : weights.length ? 0 : 10000;
      const intOf = (k: string): string | undefined => (typeof d[k] === "string" && /^\d+$/.test(d[k] as string) ? (d[k] as string) : undefined);
      await tx
        .insert(funds)
        .values({
          id: rec.fund,
          name: rec.name ?? seed?.name ?? rec.fund,
          mandate: rec.mandate ?? seed?.mandate ?? "balanced",
          manager: rec.manager ?? "",
          caps,
          seedUsd: rec.seedUsd ?? seed?.seedUsd ?? 0,
          weights,
          cashBps,
          ...(intOf("nav") ? { navMicro: intOf("nav") } : {}),
          ...(intOf("value") ? { valueMicro: intOf("value") } : {}),
          ...(intOf("supply") ? { supply: intOf("supply") } : {}),
          ...(intOf("manager_coins") ? { managerStake: intOf("manager_coins") } : {}),
          ...(intOf("pool_near") ? { poolNear: intOf("pool_near") } : {}),
          ...(intOf("pool_coins") ? { poolCoin: intOf("pool_coins") } : {}),
          createdAt: ctx.at,
          createdTx: ctx.txHash,
          raw: rec.data,
        })
        .onConflictDoUpdate({
          target: funds.id,

          set: { name: dz.sql`EXCLUDED.name`, manager: dz.sql`EXCLUDED.manager`, caps, weights, cashBps, createdAt: ctx.at, createdTx: ctx.txHash, updatedAt: new Date() },
        });
      out.fundsTouched.add(rec.fund);
      return;
    }
    case "commit": {
      if (!rec.fund) return;
      await tx
        .insert(fundCommits)
        .values({ fund: rec.fund, bell: rec.bell ?? -1, hash: rec.hash, at: ctx.at, txHash: ctx.txHash })
        .onConflictDoUpdate({ target: [fundCommits.fund, fundCommits.bell], set: { hash: rec.hash, at: ctx.at, txHash: ctx.txHash } });
      return;
    }
    case "reveal": {
      if (!rec.fund) return;
      const f = await fundRow(tx, rec.fund);
      const prev: Weight[] = (f?.weights as Weight[] | undefined) ?? [];
      const prevCash = f?.cashBps ?? 0;
      const bell = rec.bell ?? (f?.lastBell ?? 0) + 1;
      const [note] = await tx
        .select({ note: fundNotes.note })
        .from(fundNotes)
        .where(dz.and(dz.eq(fundNotes.fund, rec.fund), dz.eq(fundNotes.bell, bell)))
        .limit(1);
      const noteText = rec.note ?? note?.note ?? null;
      const turnover = turnoverBps(prev, prevCash, rec.weights, rec.cashBps);
      const inserted = await tx
        .insert(fundWeightsHistory)
        .values({
          fund: rec.fund,
          bell,
          at: ctx.at,
          weights: rec.weights,
          cashBps: rec.cashBps,
          prevWeights: prev,
          prevCashBps: prevCash,
          turnoverBps: turnover,
          note: noteText,
          edition: rec.edition,
          txHash: ctx.txHash,
          receiptId: ctx.receiptId,
          logIndex: ctx.logIndex,
        })
        .onConflictDoNothing()
        .returning({ id: fundWeightsHistory.id });
      await tx
        .update(funds)
        .set({ weights: rec.weights, cashBps: rec.cashBps, ...(noteText ? { lastNote: noteText } : {}), updatedAt: new Date() })
        .where(dz.eq(funds.id, rec.fund));
      await tx.update(fundCommits).set({ revealed: true }).where(dz.and(dz.eq(fundCommits.fund, rec.fund), dz.eq(fundCommits.bell, bell)));
      if (inserted[0]) {
        const move: Move = {
          id: String(inserted[0].id),
          fund: rec.fund,
          fundName: f?.name ?? rec.fund,
          bell,
          at: ctx.at.toISOString(),
          txHash: ctx.txHash,
          weights: rec.weights,
          cashBps: rec.cashBps,
          diffs: [],
          turnoverPct: turnover / 100,
          note: noteText,
          edition: rec.edition,
        };
        out.stream.push({ topic: "move", move });
      }
      out.fundsTouched.add(rec.fund);
      return;
    }
    case "nav": {
      const spy = await env.spyAt(ctx.at);
      await tx
        .insert(fundBells)
        .values({ bell: rec.bell, at: ctx.at, pricesHash: rec.pricesHash, spy, txHash: ctx.txHash })
        .onConflictDoUpdate({ target: fundBells.bell, set: { at: ctx.at, pricesHash: rec.pricesHash, spy, txHash: ctx.txHash } });
      for (const x of rec.navs) {
        const nav = microToUsd(x.navMicro);
        const value = microToUsd(x.valueMicro);
        await tx
          .insert(fundNavHistory)
          .values({ fund: x.fund, bell: rec.bell, at: ctx.at, navMicro: x.navMicro, valueMicro: x.valueMicro, nav, valueUsd: value, supply: x.supply, spy, txHash: ctx.txHash })
          .onConflictDoUpdate({
            target: [fundNavHistory.fund, fundNavHistory.bell],
            set: { navMicro: x.navMicro, valueMicro: x.valueMicro, nav, valueUsd: value, at: ctx.at, spy, txHash: ctx.txHash },
          });
        await tx
          .update(funds)
          .set({ navMicro: x.navMicro, valueMicro: x.valueMicro, lastBell: rec.bell, ...(x.supply ? { supply: x.supply } : {}), updatedAt: new Date() })
          .where(dz.eq(funds.id, x.fund));
        out.fundsTouched.add(x.fund);
      }
      out.stream.push({
        topic: "nav",
        bell: rec.bell,
        at: ctx.at.toISOString(),
        navs: rec.navs.map((x) => ({ fund: x.fund, nav: microToUsd(x.navMicro), valueUsd: microToUsd(x.valueMicro) })),
        pricesHash: rec.pricesHash ?? "",
      });
      return;
    }
    case "order_queued": {
      if (!rec.id || !rec.fund) return;
      let usd = rec.amountUsd;
      if (usd === null) {
        usd = rec.side === "subscribe" ? yoctoToNear(rec.amount) * rate : coinsToNum(rec.amount) * ((await lastNav(tx, rec.fund)) ?? 0);
      }
      await tx
        .insert(fundOrders)
        .values({ id: rec.id, fund: rec.fund, account: rec.account, side: rec.side, amount: rec.amount, amountUsd: usd, queuedAt: ctx.at, txHash: ctx.txHash })
        .onConflictDoNothing();
      out.stream.push({ topic: "trade", fund: rec.fund, at: ctx.at.toISOString(), kind: rec.side, account: rec.account, usd, price: null, txHash: ctx.txHash });
      return;
    }
    case "order_filled": {
      if (!rec.id) return;
      const [o] = await tx.select().from(fundOrders).where(dz.eq(fundOrders.id, rec.id)).limit(1);
      const fund = rec.fund ?? o?.fund ?? "";
      const account = rec.account ?? o?.account ?? "";
      const side = rec.side ?? (o?.side as "subscribe" | "redeem" | undefined) ?? "subscribe";
      const filled = rec.filled ?? (side === "subscribe" ? rec.coins : rec.near) ?? null;
      const navMicro = rec.navMicro;
      const nav = navMicro ? microToUsd(navMicro) : await lastNav(tx, fund);
      let usd = rec.usd;
      if (usd === null) {
        if (side === "subscribe") usd = o ? o.amountUsd : rec.near ? yoctoToNear(rec.near) * rate : null;
        else usd = filled ? yoctoToNear(filled) * rate : null;
      }
      if (o) {
        await tx
          .update(fundOrders)
          .set({ status: "filled", filled, fillNavMicro: navMicro, fillBell: rec.bell, exitLoadBps: rec.exitLoadBps, filledAt: ctx.at, fillTxHash: ctx.txHash })
          .where(dz.eq(fundOrders.id, rec.id));
      } else if (fund && account) {
        await tx
          .insert(fundOrders)
          .values({
            id: rec.id,
            fund,
            account,
            side,
            status: "filled",
            amount: side === "subscribe" ? (rec.near ?? "0") : (rec.coins ?? "0"),
            amountUsd: usd ?? 0,
            filled,
            fillNavMicro: navMicro,
            fillBell: rec.bell,
            exitLoadBps: rec.exitLoadBps,
            queuedAt: ctx.at,
            filledAt: ctx.at,
            fillTxHash: ctx.txHash,
          })
          .onConflictDoNothing();
      }
      if (!fund || !account) return;
      const coins = side === "subscribe" ? (filled ?? rec.coins ?? "0") : (o?.amount ?? rec.coins ?? "0");
      const near = side === "subscribe" ? (o?.amount ?? rec.near ?? "0") : (filled ?? rec.near ?? "0");
      await tx
        .insert(fundTrades)
        .values({
          fund,
          account,
          kind: side,
          nearAmount: near,
          coinAmount: coins,
          priceUsd: nav,
          usd,
          at: ctx.at,
          txHash: ctx.txHash,
          receiptId: ctx.receiptId,
          logIndex: ctx.logIndex,
        })
        .onConflictDoNothing();
      if (usd !== null) await addCost(tx, fund, account, side === "subscribe" ? usd : -usd, ctx.at);
      out.balances.add(pairKey(fund, account));
      out.fundsTouched.add(fund);
      return;
    }
    case "order_cancelled": {
      if (!rec.id) return;
      await tx.update(fundOrders).set({ status: "cancelled", filledAt: ctx.at }).where(dz.eq(fundOrders.id, rec.id));
      return;
    }
    case "swap": {
      if (!rec.fund) return;
      const nearF = yoctoToNear(rec.near);
      const coinsF = coinsToNum(rec.coins);
      const usd = nearF * rate;
      const price = rec.priceMicro ? microToUsd(rec.priceMicro) : coinsF > 0 ? usd / coinsF : null;
      await tx
        .insert(fundTrades)
        .values({
          fund: rec.fund,
          account: rec.account,
          kind: rec.side === "buy" ? "pool_buy" : "pool_sell",
          nearAmount: rec.near,
          coinAmount: rec.coins,
          priceUsd: price,
          usd,
          at: ctx.at,
          txHash: ctx.txHash,
          receiptId: ctx.receiptId,
          logIndex: ctx.logIndex,
        })
        .onConflictDoNothing();
      if (rec.account) {
        await addCost(tx, rec.fund, rec.account, rec.side === "buy" ? usd : -usd, ctx.at);
        out.balances.add(pairKey(rec.fund, rec.account));
      }
      if (price !== null) out.candles.push({ fund: rec.fund, at: ctx.at, price, usd });
      out.fundsTouched.add(rec.fund);
      out.stream.push({ topic: "trade", fund: rec.fund, at: ctx.at.toISOString(), kind: rec.side === "buy" ? "pool_buy" : "pool_sell", account: rec.account, usd, price, txHash: ctx.txHash });
      return;
    }
    case "cross_trade": {
      if (!rec.fund || !rec.target) return;
      const usd = rec.usd ?? yoctoToNear(rec.near) * rate;
      const coinsF = coinsToNum(rec.coins);
      const price = coinsF > 0 ? usd / coinsF : null;
      await tx
        .insert(fundTrades)
        .values({
          fund: rec.target,
          account: rec.fund,
          kind: "cross_trade",
          nearAmount: rec.near,
          coinAmount: rec.coins,
          priceUsd: price,
          usd: rec.side === "buy" ? usd : -usd,
          at: ctx.at,
          txHash: ctx.txHash,
          receiptId: ctx.receiptId,
          logIndex: ctx.logIndex,
        })
        .onConflictDoNothing();
      const sign = rec.side === "buy" ? "" : "-";
      await tx.execute(dz.sql`
        INSERT INTO fund_cross_holdings (holder, target, coins, cost_usd, updated_at)
        VALUES (${rec.fund}, ${rec.target}, ${sign + rec.coins}::numeric, ${rec.side === "buy" ? usd : -usd}, now())
        ON CONFLICT (holder, target) DO UPDATE SET coins = GREATEST(0, fund_cross_holdings.coins + EXCLUDED.coins),
          cost_usd = fund_cross_holdings.cost_usd + EXCLUDED.cost_usd, updated_at = now()`);
      if (price !== null) out.candles.push({ fund: rec.target, at: ctx.at, price, usd });
      out.fundsTouched.add(rec.fund);
      out.fundsTouched.add(rec.target);
      out.stream.push({ topic: "trade", fund: rec.target, at: ctx.at.toISOString(), kind: "cross_trade", account: rec.fund, usd, price, txHash: ctx.txHash });
      return;
    }
    case "fee": {
      if (!rec.fund) return;
      await tx
        .insert(fundFees)
        .values({
          fund: rec.fund,
          kind: rec.feeKind,
          amount: rec.amount,
          usd: rec.usd ?? yoctoToNear(rec.amount) * rate,
          to: rec.to,
          quarter: rec.quarter,
          at: ctx.at,
          txHash: ctx.txHash,
          receiptId: ctx.receiptId,
          logIndex: ctx.logIndex,
        })
        .onConflictDoNothing();
      return;
    }
    case "buyback": {
      if (!rec.fund) return;
      const usd = yoctoToNear(rec.near) * rate;
      await tx
        .insert(fundFees)
        .values({ fund: rec.fund, kind: "buyback", amount: rec.near, usd, at: ctx.at, txHash: ctx.txHash, receiptId: ctx.receiptId, logIndex: ctx.logIndex })
        .onConflictDoNothing();
      const coinsF = coinsToNum(rec.coins);
      if (coinsF > 0) {
        await tx
          .insert(fundTrades)
          .values({
            fund: rec.fund,
            account: "buyback",
            kind: "buyback",
            nearAmount: rec.near,
            coinAmount: rec.coins,
            priceUsd: usd / coinsF,
            usd,
            at: ctx.at,
            txHash: ctx.txHash,
            receiptId: ctx.receiptId,
            logIndex: ctx.logIndex,
          })
          .onConflictDoNothing();
        out.candles.push({ fund: rec.fund, at: ctx.at, price: usd / coinsF, usd });
      }
      out.fundsTouched.add(rec.fund);
      out.stream.push({ topic: "trade", fund: rec.fund, at: ctx.at.toISOString(), kind: "buyback", account: rec.fund, usd, price: coinsF > 0 ? usd / coinsF : null, txHash: ctx.txHash });
      return;
    }
    case "promise_set": {
      if (!rec.fund) return;
      await tx
        .insert(fundPromises)
        .values({ fund: rec.fund, season: rec.season, targetBps: rec.targetBps, bondBps: rec.bondBps, bondCoins: rec.bondCoins, setAt: ctx.at, txHash: ctx.txHash })
        .onConflictDoUpdate({
          target: [fundPromises.fund, fundPromises.season],
          set: { targetBps: rec.targetBps, bondBps: rec.bondBps, bondCoins: rec.bondCoins, setAt: ctx.at, txHash: ctx.txHash },
        });
      return;
    }
    case "promise_settled": {
      if (!rec.fund) return;
      await tx
        .update(fundPromises)
        .set({ status: rec.kept ? "kept" : "missed", compensation: rec.compensation, userReturnBps: rec.userReturnBps, settledAt: ctx.at })
        .where(dz.and(dz.eq(fundPromises.fund, rec.fund), dz.eq(fundPromises.season, rec.season)));
      return;
    }
    case "reputation_anchored": {
      for (const x of rec.scores) {
        await tx
          .insert(fundReputationScores)
          .values({ fund: x.fund, at: ctx.at, score: x.score, anchored: true, quarter: rec.quarter, root: rec.root, txHash: ctx.txHash })
          .onConflictDoNothing();
      }
      return;
    }
    case "quarter_closed": {
      const quarters = env.quarters;
      const season = rec.season ?? Math.floor(rec.quarter / Math.max(1, quarters));
      const spy = rec.spyReturnBps;
      const results: Record<string, { ret: number | null; vsSpy: number | null }> = {};
      for (const r of rec.results) {
        const ret = r.returnBps === null ? null : r.returnBps / 100;
        results[r.fund] = { ret, vsSpy: ret !== null && spy !== null ? (r.returnBps! - spy) / 100 : null };
      }
      const best = rec.results.filter((r) => r.returnBps !== null).sort((a, b) => b.returnBps! - a.returnBps!)[0];
      await tx
        .insert(fundQuarters)
        .values({ season, quarter: rec.quarter, closedAt: ctx.at, txHash: ctx.txHash, results, spyRet: spy === null ? null : spy / 100, winner: best?.fund ?? null })
        .onConflictDoUpdate({
          target: [fundQuarters.season, fundQuarters.quarter],
          set: { closedAt: ctx.at, txHash: ctx.txHash, results, spyRet: spy === null ? null : spy / 100, winner: best?.fund ?? null },
        });
      return;
    }
    case "dna_revealed": {
      if (!rec.fund || !Object.keys(rec.traits).length) return;
      await tx.update(funds).set({ dna: rec.traits, updatedAt: new Date() }).where(dz.eq(funds.id, rec.fund));
      if (rec.season !== null) {
        await tx
          .insert(fundSeasons)
          .values({ season: rec.season, dnaRevealed: true })
          .onConflictDoUpdate({ target: fundSeasons.season, set: { dnaRevealed: true } });
      }
      return;
    }
    case "badge_minted": {
      if (!rec.tokenId) return;
      const title = BADGE_TITLES[rec.badge] ?? `Investor badge: ${rec.badge.replace(/_/g, " ")}`;
      await tx
        .insert(fundNfts)
        .values({
          tokenId: rec.tokenId,
          kind: "badge",
          owner: rec.account,
          fund: rec.fund,
          title,
          season: rec.season,
          badgeKind: rec.badge,
          soulbound: true,
          mintedAt: ctx.at,
          txHash: ctx.txHash,
        })
        .onConflictDoUpdate({ target: fundNfts.tokenId, set: { kind: "badge", badgeKind: rec.badge, fund: rec.fund, season: rec.season, soulbound: true } });
      return;
    }
    case "seat_auction_started": {
      if (!rec.fund) return;
      const endsAt = rec.endsAtMs ? new Date(rec.endsAtMs) : null;
      await tx
        .insert(fundSeatAuctions)
        .values({ fund: rec.fund, open: true, endsAt })
        .onConflictDoUpdate({ target: fundSeatAuctions.fund, set: { open: true, endsAt, highBidder: null, highBid: null, winner: null, settledAt: null, updatedAt: new Date() } });
      return;
    }
    case "season_started": {
      await tx
        .insert(fundSeasons)
        .values({ season: rec.season, startedAt: ctx.at, raw: rec.data })
        .onConflictDoUpdate({ target: fundSeasons.season, set: { startedAt: ctx.at, raw: rec.data } });
      return;
    }
    case "season_settled": {
      await tx
        .insert(fundSeasons)
        .values({ season: rec.season, settledAt: ctx.at, winner: rec.winner, dnaRevealed: !!rec.dna })
        .onConflictDoUpdate({ target: fundSeasons.season, set: { settledAt: ctx.at, winner: rec.winner, dnaRevealed: !!rec.dna } });
      if (rec.dna) {
        for (const [fund, dna] of Object.entries(rec.dna)) {
          const traits: Record<string, number> = {};
          for (const [k, v] of Object.entries(dna)) if (typeof v === "number") traits[k] = v;
          await tx.update(funds).set({ dna: traits }).where(dz.eq(funds.id, fund));
        }
      }
      return;
    }
    case "nft_mint": {
      for (const tokenId of rec.tokenIds) {
        const tok = await env.views.nftToken(tokenId).catch(() => null);
        const meta = (tok?.metadata as Obj | undefined) ?? {};
        let extra: Obj | null = null;
        if (typeof meta.extra === "string") {
          try {
            extra = JSON.parse(meta.extra) as Obj;
          } catch {
            extra = { text: meta.extra };
          }
        } else if (meta.extra && typeof meta.extra === "object") extra = meta.extra as Obj;
        const kind = nftKind(tokenId, extra, rec.memo);
        const numOr = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
        const fund = (typeof extra?.fund === "string" ? extra.fund : null) ?? fundFromToken(tokenId);
        await tx
          .insert(fundNfts)
          .values({
            tokenId,
            kind,
            owner: (typeof tok?.owner_id === "string" ? tok.owner_id : null) ?? rec.owner,
            fund,
            title: (typeof meta.title === "string" ? meta.title : null) ?? defaultTitle(kind, fund, extra),
            description: typeof meta.description === "string" ? meta.description : null,
            edition: numOr(extra?.edition) ?? (kind === "basket" ? editionFromToken(tokenId) : null),
            bell: numOr(extra?.bell),
            season: numOr(extra?.season),
            badgeKind: typeof extra?.badge === "string" ? extra.badge : typeof extra?.badge_kind === "string" ? extra.badge_kind : null,
            ...(kind === "badge" && !meta.title && typeof extra?.badge === "string" && BADGE_TITLES[extra.badge] ? { title: BADGE_TITLES[extra.badge]! } : {}),
            soulbound: kind === "badge" || extra?.soulbound === true,
            extra,
            mintedAt: ctx.at,
            txHash: ctx.txHash,
          })
          .onConflictDoUpdate({
            target: fundNfts.tokenId,
            set: { owner: (typeof tok?.owner_id === "string" ? tok.owner_id : null) ?? rec.owner, extra, ...(kind === "basket" ? { kind } : {}) },
          });
      }
      return;
    }
    case "nft_transfer": {
      for (const tokenId of rec.tokenIds) await tx.update(fundNfts).set({ owner: rec.to }).where(dz.eq(fundNfts.tokenId, tokenId));
      return;
    }
    case "nft_burn": {
      for (const tokenId of rec.tokenIds) await tx.update(fundNfts).set({ burned: true }).where(dz.eq(fundNfts.tokenId, tokenId));
      return;
    }
    case "seat_bid": {
      if (!rec.fund) return;
      const endsAt = rec.endsAtMs ? new Date(rec.endsAtMs) : null;
      await tx
        .insert(fundSeatAuctions)
        .values({ fund: rec.fund, open: true, highBidder: rec.bidder, highBid: rec.amount, endsAt })
        .onConflictDoUpdate({
          target: fundSeatAuctions.fund,
          set: { open: true, highBidder: rec.bidder, highBid: rec.amount, ...(endsAt ? { endsAt } : {}), winner: null, settledAt: null, updatedAt: new Date() },
        });
      return;
    }
    case "seat_won": {
      if (!rec.fund) return;
      await tx
        .insert(fundSeatAuctions)
        .values({ fund: rec.fund, open: false, winner: rec.winner, highBid: rec.amount, settledAt: ctx.at })
        .onConflictDoUpdate({ target: fundSeatAuctions.fund, set: { open: false, winner: rec.winner, settledAt: ctx.at, updatedAt: new Date() } });
      return;
    }
    case "mt_mint":
    case "mt_burn": {
      for (const t of rec.tokenIds) out.balances.add(pairKey(env.tokenToFund(t), rec.owner));
      return;
    }
    case "mt_transfer": {
      for (const t of rec.tokenIds) {
        out.balances.add(pairKey(env.tokenToFund(t), rec.from));
        out.balances.add(pairKey(env.tokenToFund(t), rec.to));
      }
      return;
    }
    case "fund_status": {
      if (!rec.fund) return;
      await tx.update(funds).set({ status: rec.status, updatedAt: new Date() }).where(dz.eq(funds.id, rec.fund));
      return;
    }
    case "raw":
      return;
  }
}

async function currentSeason(tx: Tx): Promise<number> {
  const [r] = await tx.select({ s: dz.max(fundSeasons.season) }).from(fundSeasons);
  return r?.s ?? 1;
}

export function nftKind(tokenId: string, extra: Obj | null, memo: string | null): "seat" | "basket" | "badge" | "trophy" {
  const k = typeof extra?.kind === "string" ? extra.kind.toLowerCase() : "";
  if (k === "seat" || k === "basket" || k === "badge" || k === "trophy") return k;
  if (k === "card" || k === "basket_card") return "basket";
  const hay = `${tokenId} ${memo ?? ""}`.toLowerCase();
  if (hay.includes("seat")) return "seat";
  if (hay.includes("trophy")) return "trophy";
  if (hay.includes("badge")) return "badge";
  return "basket";
}

export const BADGE_TITLES: Record<string, string> = {
  season_winner_backer: "Backed the season winner",
  season_winner: "Backed the season winner",
  black_swan_holder: "Held through a black-swan day",
  black_swan: "Held through a black-swan day",
  early_backer: "Early backer",
  kept_faith: "Kept faith",
};

export function fundFromToken(tokenId: string): string | null {
  const parts = tokenId.split(/[:\-/]/);
  for (const p of parts) if (p in FUND_SEEDS) return p;
  return null;
}

export function editionFromToken(tokenId: string): number | null {
  const m = /(\d+)$/.exec(tokenId);
  return m ? Number(m[1]) : null;
}

function defaultTitle(kind: string, fund: string | null, extra: Obj | null): string {
  const name = fund ? (FUND_SEEDS[fund as SeedFundId]?.name ?? fund) : "Drixie";
  if (kind === "seat") return `${name} manager seat`;
  if (kind === "basket") return `${name} basket card${extra?.edition ? ` #${String(extra.edition)}` : ""}`;
  if (kind === "trophy") return `Manager of the Year${extra?.season ? ` — Season ${String(extra.season)}` : ""}`;
  return `Investor badge`;
}

export { pairKey };
