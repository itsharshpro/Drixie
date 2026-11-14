import type { AssetsResponse, FundDetail, FundsResponse, MovesPage, SeasonResponse } from "@listed/shared";
import { errMsg, nearToYoctoBig, yoctoToNearStr, type ChainSigner, type NearRpc } from "@listed/agents/lib";
import type { SpendBudget } from "./budget.js";

export class ToolError extends Error {}

export interface FundsDeps {
  network: string;
  apiBase: string;
  rpc: Pick<NearRpc, "view">;

  contract: () => string | null;

  investor: ChainSigner | null;
  investorNote: string | null;
  maxOrder: bigint;
  budget?: SpendBudget;
  explorerTxUrl: string | null;
  log?: { warn: (obj: object, msg: string) => void };
  fetchJson?: <T>(url: string) => Promise<T | null>;
}

const COIN = 10n ** 18n;
const MIN_SUBSCRIBE = nearToYoctoBig("0.05");

async function defaultFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function publicReason(e: unknown): string | null {
  const m = /Smart contract panicked: ([^"\n]{1,280})/.exec(errMsg(e));
  return m?.[1]?.trim() ?? null;
}

const get = <T>(d: FundsDeps, path: string) => (d.fetchJson ?? defaultFetchJson)<T>(`${d.apiBase}${path}`);

function fundId(raw: string): string {
  const id = raw.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,16}$/.test(id)) throw new ToolError(`"${raw}" is not a fund id. Use list_funds to see ids like atlas or nova.`);
  return id;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v.toFixed(2)));
const usd = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? null : Number(v.toFixed(digits)));

export interface FundListRow {
  id: string;
  name: string;
  mandate: string;
  navUsd: number;
  coinPriceUsd: number | null;
  premiumPct: number | null;
  return1dPct: number | null;
  returnSeasonPct: number | null;
  vsSpyPp: number | null;
  aumUsd: number;
  reputation: number;
  brainTier: string;
  status: string;
}

export async function listFunds(d: FundsDeps): Promise<{ funds: FundListRow[]; spySeasonPct: number | null; nextBellAt: string | null; note: string }> {
  const r = await get<FundsResponse>(d, "/funds");
  if (r?.items?.length) {
    return {
      funds: r.items.map((f) => ({
        id: f.id,
        name: f.name,
        mandate: f.mandateLine,
        navUsd: usd(f.nav, 4) as number,
        coinPriceUsd: usd(f.coinPrice, 4),
        premiumPct: pct(f.premium),
        return1dPct: pct(f.ret1d),
        returnSeasonPct: pct(f.retSeason),
        vsSpyPp: pct(f.vsSpy),
        aumUsd: usd(f.aum, 0) as number,
        reputation: f.reputation,
        brainTier: f.brainTier,
        status: f.status,
      })),
      spySeasonPct: pct(r.spySeason),
      nextBellAt: r.nextBellAt,
      note: "A simulation priced off real markets: fund coins are testnet tokens and nobody owns real shares.",
    };
  }

  const contract = d.contract();
  if (!contract) throw new ToolError("The funds are not live on this network yet. Try again once the contract is deployed.");
  try {
    const rows = await d.rpc.view<{ id: string; name: string; mandate: string; nav: string; value: string; coin_price: string; premium_bps: number; reputation: number; status: string }[]>(contract, "get_funds", {});
    return {
      funds: rows.map((f) => ({
        id: f.id,
        name: f.name,
        mandate: f.mandate,
        navUsd: Number(f.nav) / 1e6,
        coinPriceUsd: Number(f.coin_price) / 1e6 || null,
        premiumPct: f.premium_bps / 100,
        return1dPct: null,
        returnSeasonPct: null,
        vsSpyPp: null,
        aumUsd: Math.round(Number(f.value) / 1e6),
        reputation: f.reputation,
        brainTier: Number(f.value) / 1e6 >= 3e6 ? "best" : Number(f.value) / 1e6 >= 1e6 ? "primary" : "small",
        status: f.status,
      })),
      spySeasonPct: null,
      nextBellAt: null,
      note: "Read from the chain (the API is unavailable): returns vs SPY appear once the API is back.",
    };
  } catch (e) {
    d.log?.warn({ err: errMsg(e) }, "get_funds failed");
    throw new ToolError("Could not read the funds right now. Try again in a minute.");
  }
}

export async function getFund(d: FundsDeps, raw: string): Promise<Record<string, unknown>> {
  const id = fundId(raw);
  const [f, moves] = await Promise.all([get<FundDetail>(d, `/funds/${id}`), get<MovesPage>(d, `/funds/${id}/moves?limit=3`)]);
  if (!f) throw new ToolError(`There is no fund "${id}" (or the API is unavailable). Use list_funds to see the funds.`);
  return {
    id: f.id,
    name: f.name,
    mandate: f.mandateLine,
    navUsd: usd(f.nav, 4),
    coinPriceUsd: usd(f.coinPrice, 4),
    premiumPct: pct(f.premium),
    returns: { day: pct(f.ret1d), season: pct(f.retSeason), vsSpyPp: pct(f.vsSpy) },
    valueUsd: usd(f.valueUsd, 0),
    reputation: f.reputation,
    brainTier: f.brainTier,
    status: f.status,
    cashBps: f.cashBps,
    holdings: f.holdings.map((h) => ({ asset: h.asset, name: h.name, basket: h.basket, weightPct: h.bps / 100, priceUsd: h.price, estimated: h.estimated, return1dPct: pct(h.ret1d) })),
    promise: f.promise ? { targetPct: f.promise.targetBps / 100, bondBps: f.promise.bondBps, progressPct: pct(f.promise.progressPct), status: f.promise.status } : null,
    brainBillSeasonUsd: usd(f.brainBillSeason),
    outsideHoldersPct: pct(f.outsideHolders),
    lastNote: f.lastNote,
    recentMoves: (moves?.items ?? []).map((m) => ({ bell: m.bell, at: m.at, note: m.note, turnoverPct: pct(m.turnoverPct), changes: m.diffs.filter((x) => x.kind !== "same").map((x) => `${x.asset} ${x.delta > 0 ? "+" : ""}${x.delta} bps`) })),
    nextBellAt: f.nextBellAt,
  };
}

export async function getAssets(d: FundsDeps, basket?: string): Promise<Record<string, unknown>> {
  const r = await get<AssetsResponse>(d, "/assets");
  if (!r) throw new ToolError("Could not read the asset prices right now. Try again in a minute.");
  const baskets = r.baskets.filter((b) => !basket || b.id === basket || b.label.toLowerCase() === basket.toLowerCase());
  if (basket && !baskets.length) throw new ToolError(`No basket "${basket}". Baskets: ${r.baskets.map((b) => b.id).join(", ")}.`);
  return {
    benchmark: { symbol: r.benchmark.symbol, priceUsd: r.benchmark.price, change1dPct: pct(r.benchmark.change1d) },
    baskets: baskets.map((b) => ({
      id: b.id,
      label: b.label,
      assets: b.assets.map((a) => ({ id: a.id, name: a.name, priceUsd: a.price, change1dPct: pct(a.change1d), estimated: a.estimated, heldBy: a.heldBy, updatedAt: a.updatedAt })),
    })),
    note: "Listed stocks use real market prices (last price while markets are closed). Startup prices are estimated from news and funding rounds.",
    updatedAt: r.updatedAt,
  };
}

export async function season(d: FundsDeps): Promise<Record<string, unknown>> {
  const s = await get<SeasonResponse>(d, "/season");
  if (s) {
    return {
      clock: s.clock,
      leaderboard: s.funds.map((f) => ({ rank: f.rank, fund: f.fund, name: f.name, score: f.score, returnSeasonPct: pct(f.retSeason), vsSpyPp: pct(f.vsSpy), reputation: f.reputation })),
      topInvestors: s.users.slice(0, 10).map((u) => ({ rank: u.rank, account: u.account, returnPct: pct(u.retPct), house: u.isHouse })),
      quarters: s.quarters,
      dnaRevealed: s.dnaRevealed,
      settled: s.settled,
    };
  }
  const contract = d.contract();
  if (!contract) throw new ToolError("The season has not started on this network yet.");
  try {
    const c = await d.rpc.view<Record<string, unknown>>(contract, "get_clock", {});
    return { clock: c, leaderboard: [], note: "Read from the chain (the API is unavailable)." };
  } catch (e) {
    d.log?.warn({ err: errMsg(e) }, "get_clock failed");
    throw new ToolError("Could not read the season clock right now. Try again in a minute.");
  }
}

function needInvestor(d: FundsDeps): { signer: ChainSigner; contract: string } {
  if (!d.investor) throw new ToolError(d.investorNote ?? "This server has no investor account configured.");
  const contract = d.contract();
  if (!contract) throw new ToolError("The funds are not live on this network yet.");
  return { signer: d.investor, contract };
}

const txLink = (d: FundsDeps, hash: string) => (d.explorerTxUrl ? `${d.explorerTxUrl.replace(/\/+$/, "")}/${hash}` : null);

export async function subscribe(d: FundsDeps, rawFund: string, amountNear: string): Promise<Record<string, unknown>> {
  const id = fundId(rawFund);
  const { signer, contract } = needInvestor(d);
  let deposit: bigint;
  try {
    deposit = nearToYoctoBig(amountNear);
  } catch {
    throw new ToolError(`"${amountNear}" is not a NEAR amount. Use a number like "0.5".`);
  }
  if (deposit < MIN_SUBSCRIBE) throw new ToolError("The smallest buy-in is 0.05 NEAR.");
  if (deposit > d.maxOrder) throw new ToolError(`This server buys in at most ${yoctoToNearStr(d.maxOrder)} NEAR per order.`);
  const fund = await d.rpc.view<{ id: string; nav: string; status: string } | null>(contract, "get_fund", { fund: id }).catch(() => null);
  if (!fund) throw new ToolError(`There is no fund "${id}". Use list_funds to see the funds.`);
  const hold = d.budget?.reserve(deposit) ?? null;
  if (d.budget && !hold) throw new ToolError("This server's daily investing budget is used up. Try again tomorrow.");
  try {
    const tx = await signer.call<string>(contract, "subscribe", { fund: id }, { deposit, gasTgas: 50 });
    hold?.commit();
    const cfg = await d.rpc.view<{ game_usd_per_near?: number }>(contract, "get_config", {}).catch(() => null);
    const rate = cfg?.game_usd_per_near ?? 100;
    const nav = Number(fund.nav) / 1e6;
    const depositUsd = Number(yoctoToNearStr(deposit, 6)) * rate;
    return {
      orderId: tx.value ?? null,
      fund: id,
      account: signer.accountId,
      depositNear: yoctoToNearStr(deposit),
      depositUsd: Number(depositUsd.toFixed(2)),
      status: "queued",
      fillsAt: "the next NAV post (the next rebalance bell)",
      estimatedCoinsAtCurrentNav: nav > 0 ? Number((depositUsd / nav).toFixed(4)) : null,
      txHash: tx.txHash,
      explorer: txLink(d, tx.txHash),
      note: "Forward pricing: the exact coins are set by the NAV posted at the next bell.",
    };
  } catch (e) {
    hold?.release();
    const reason = publicReason(e);
    d.log?.warn({ err: errMsg(e) }, "subscribe failed");
    throw new ToolError(reason ? `The contract refused the buy-in: ${reason}` : "The buy-in did not go through. Try again in a minute.");
  }
}

export async function redeem(d: FundsDeps, rawFund: string, coins: string): Promise<Record<string, unknown>> {
  const id = fundId(rawFund);
  const { signer, contract } = needInvestor(d);
  const holding = await d.rpc.view<{ coins: string; exit_load_bps: number; value_micro_usd: string } | null>(contract, "get_holding", { fund: id, account: signer.accountId }).catch(() => null);
  if (!holding) throw new ToolError(`Could not read your ${id} coins right now. Try again in a minute.`);
  const held = BigInt(holding.coins || "0");
  if (held === 0n) throw new ToolError(`${signer.accountId} holds no ${id} coins.`);
  let raw: bigint;
  if (coins.trim().toLowerCase() === "all") raw = held;
  else {
    const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(coins.trim());
    if (!m) throw new ToolError(`"${coins}" is not a coin amount. Use a number like "12.5" or "all".`);
    raw = BigInt(m[1] as string) * COIN + BigInt(((m[2] ?? "") + "0".repeat(18)).slice(0, 18));
  }
  if (raw <= 0n) throw new ToolError("Redeem a positive number of coins.");
  if (raw > held) throw new ToolError(`You hold ${(Number(held) / 1e18).toFixed(4)} ${id} coins.`);
  try {
    const tx = await signer.call<string>(contract, "redeem", { fund: id, coins: raw.toString() }, { gasTgas: 50 });
    const valueUsd = (Number(holding.value_micro_usd) / 1e6) * (Number(raw) / Number(held));
    return {
      orderId: tx.value ?? null,
      fund: id,
      account: signer.accountId,
      coins: Number((Number(raw) / 1e18).toFixed(6)),
      status: "queued",
      fillsAt: "the next NAV post (the next rebalance bell)",
      estimatedUsdAtCurrentNav: Number((valueUsd * (1 - holding.exit_load_bps / 10_000)).toFixed(2)),
      exitLoadPct: holding.exit_load_bps / 100,
      txHash: tx.txHash,
      explorer: txLink(d, tx.txHash),
      note: "Paid in NEAR at the game rate when the order fills; pro rata if the vault's coverage is below 100%.",
    };
  } catch (e) {
    const reason = publicReason(e);
    d.log?.warn({ err: errMsg(e) }, "redeem failed");
    throw new ToolError(reason ? `The contract refused the cash-out: ${reason}` : "The cash-out did not go through. Try again in a minute.");
  }
}
