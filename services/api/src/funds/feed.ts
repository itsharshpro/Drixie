import { dz, type Db } from "@listed/db";
import { UNIVERSE } from "@listed/fundmath";
import { FUND_SEEDS, type FeedItem, type FeedKind, type FeedPage, type SeedFundId } from "@listed/shared";
import { decodeCursor, encodeCursor, isTimeCursor } from "../lib/cursor";
import { handleOf } from "../lib/player";
import { coinsNum, nearNum, pgArray } from "./common";
import { assetName } from "./queries";

export const FEED_KINDS: FeedKind[] = ["move", "flow", "trade", "raid", "reputation", "news", "fee", "promise", "nft"];

const usdFmt = (v: number) => `$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 })}`;
const nameOf = (id: string | null) => (id ? (FUND_SEEDS[id as SeedFundId]?.name ?? id) : "");

interface Ctx {
  root: string;
  fund: string | null;

  before: string | null;
  limit: number;
}

function who(account: string, root: string): string {
  const fund = FUND_SEEDS[account as SeedFundId];
  if (fund) return fund.name;
  return handleOf(account, root) ?? account;
}

async function moves(db: Db, c: Ctx): Promise<FeedItem[]> {
  const rows = await db.execute<{ id: number; fund: string; at: Date; weights: { asset: string; bps: number }[]; prev_weights: { asset: string; bps: number }[]; note: string | null; tx_hash: string; bell: number }>(dz.sql`
    SELECT id, fund, at, weights, prev_weights, note, tx_hash, bell FROM fund_weights_history
    WHERE (${c.fund}::text IS NULL OR fund = ${c.fund}) AND (${c.before}::timestamptz IS NULL OR at <= ${c.before})
    ORDER BY at DESC, id DESC LIMIT ${c.limit}`);
  return rows.map((r) => {
    const before = new Map(r.prev_weights.map((w) => [w.asset, w.bps]));
    const after = new Map(r.weights.map((w) => [w.asset, w.bps]));
    const diffs = [...new Set([...before.keys(), ...after.keys()])]
      .map((a) => ({ a, d: (after.get(a) ?? 0) - (before.get(a) ?? 0) }))
      .filter((x) => x.d !== 0)
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      .slice(0, 3)
      .map((x) => `${x.d > 0 ? "+" : "−"}${assetName(x.a)} ${(Math.abs(x.d) / 100).toFixed(1)}%`);
    const title = r.prev_weights.length
      ? diffs.length
        ? `${nameOf(r.fund)} rebalanced: ${diffs.join(", ")}`
        : `${nameOf(r.fund)} held its basket at bell ${r.bell}`
      : `${nameOf(r.fund)} built its first basket of ${r.weights.length} holdings`;
    return { id: `move:${r.id}`, kind: "move", at: new Date(r.at).toISOString(), fund: r.fund, account: null, title, detail: r.note, usd: null, txHash: r.tx_hash, url: null };
  });
}

async function flows(db: Db, c: Ctx): Promise<FeedItem[]> {
  const rows = await db.execute<{ id: string; fund: string; account: string; side: string; status: string; amount_usd: number; queued_at: Date; filled_at: Date | null; tx: string | null; at: Date }>(dz.sql`
    SELECT id, fund, account, side, status, amount_usd, queued_at, filled_at, COALESCE(fill_tx_hash, tx_hash) AS tx, COALESCE(filled_at, queued_at) AS at
    FROM fund_orders WHERE status <> 'cancelled' AND (${c.fund}::text IS NULL OR fund = ${c.fund})
      AND (${c.before}::timestamptz IS NULL OR COALESCE(filled_at, queued_at) <= ${c.before})
    ORDER BY at DESC, id DESC LIMIT ${c.limit}`);
  return rows.map((r) => {
    const name = who(r.account, c.root);
    const usd = Number(r.amount_usd);
    const filled = r.status === "filled";
    const title =
      r.side === "redeem"
        ? `${name} ${filled ? "cashed out of" : "asked to cash out of"} ${nameOf(r.fund)} (${usdFmt(usd)})`
        : `${name} ${filled ? "bought into" : "queued a buy-in to"} ${nameOf(r.fund)} for ${usdFmt(usd)}`;
    return { id: `flow:${r.id}`, kind: "flow", at: new Date(r.at).toISOString(), fund: r.fund, account: r.account, title, detail: filled ? null : "Fills at the next NAV post.", usd: r.side === "redeem" ? -usd : usd, txHash: r.tx, url: null };
  });
}

async function trades(db: Db, c: Ctx, kinds: string[], kind: FeedKind): Promise<FeedItem[]> {
  const rows = await db.execute<{ id: number; fund: string; account: string; kind: string; usd: number | null; coin_amount: string; at: Date; tx_hash: string }>(dz.sql`
    SELECT id, fund, account, kind, usd, coin_amount::text AS coin_amount, at, tx_hash FROM fund_trades
    WHERE kind = ANY(${pgArray(kinds)}::text[]) AND (${c.fund}::text IS NULL OR fund = ${c.fund} OR account = ${c.fund})
      AND (${c.before}::timestamptz IS NULL OR at <= ${c.before})
    ORDER BY at DESC, id DESC LIMIT ${c.limit}`);
  return rows.map((r) => {
    const usd = Number(r.usd ?? 0);
    let title: string;
    if (r.kind === "cross_trade") title = `${nameOf(r.account)} ${usd >= 0 ? "bought" : "sold"} ${usdFmt(usd)} of ${nameOf(r.fund)}'s coin`;
    else if (r.kind === "buyback") title = `${nameOf(r.fund)} bought back and burned ${usdFmt(usd)} of its coin`;
    else title = `${who(r.account, c.root)} ${r.kind === "pool_buy" ? "bought" : "sold"} ${usdFmt(usd)} of ${nameOf(r.fund)} coin`;
    return {
      id: `trade:${r.id}`,
      kind: r.kind === "buyback" ? "fee" : kind,
      at: new Date(r.at).toISOString(),
      fund: r.fund,
      account: r.account,
      title,
      detail: `${coinsNum(r.coin_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} coins`,
      usd: r.kind === "pool_sell" ? -Math.abs(usd) : usd,
      txHash: r.tx_hash,
      url: null,
    };
  });
}

async function reputation(db: Db, c: Ctx): Promise<FeedItem[]> {
  const rows = await db.execute<{ id: number; fund: string; at: Date; delta: number; score: number; reason: string }>(dz.sql`
    SELECT id, fund, at, delta, score, reason FROM fund_reputation_events
    WHERE (${c.fund}::text IS NULL OR fund = ${c.fund}) AND (${c.before}::timestamptz IS NULL OR at <= ${c.before})
    ORDER BY at DESC, id DESC LIMIT ${c.limit}`);
  return rows.map((r) => ({
    id: `reputation:${r.id}`,
    kind: "reputation",
    at: new Date(r.at).toISOString(),
    fund: r.fund,
    account: null,
    title: `${nameOf(r.fund)} reputation ${r.delta >= 0 ? "+" : "−"}${Math.abs(r.delta)} → ${r.score}`,
    detail: r.reason,
    usd: null,
    txHash: null,
    url: null,
  }));
}

async function promises(db: Db, c: Ctx): Promise<FeedItem[]> {
  const rows = await db.execute<{ fund: string; season: number; target_bps: number; bond_bps: number; status: string; set_at: Date; settled_at: Date | null; tx_hash: string | null; at: Date }>(dz.sql`
    SELECT fund, season, target_bps, bond_bps, status, set_at, settled_at, tx_hash, COALESCE(settled_at, set_at) AS at FROM fund_promises
    WHERE (${c.fund}::text IS NULL OR fund = ${c.fund}) AND (${c.before}::timestamptz IS NULL OR COALESCE(settled_at, set_at) <= ${c.before})
    ORDER BY at DESC LIMIT ${c.limit}`);
  return rows.map((r) => ({
    id: `promise:${r.fund}:${r.season}:${r.status}`,
    kind: "promise",
    at: new Date(r.at).toISOString(),
    fund: r.fund,
    account: null,
    title:
      r.status === "open"
        ? `${nameOf(r.fund)} promised ${(r.target_bps / 100).toFixed(1)}% this season, bonding ${(r.bond_bps / 100).toFixed(0)}% of its stake`
        : `${nameOf(r.fund)} ${r.status === "kept" ? "kept" : "missed"} its ${(r.target_bps / 100).toFixed(1)}% promise`,
    detail: null,
    usd: null,
    txHash: r.tx_hash,
    url: null,
  }));
}

async function nfts(db: Db, c: Ctx): Promise<FeedItem[]> {
  const rows = await db.execute<{ token_id: string; kind: string; owner: string; fund: string | null; title: string; minted_at: Date; tx_hash: string | null }>(dz.sql`
    SELECT token_id, kind, owner, fund, title, minted_at, tx_hash FROM fund_nfts
    WHERE kind <> 'basket' AND (${c.fund}::text IS NULL OR fund = ${c.fund}) AND (${c.before}::timestamptz IS NULL OR minted_at <= ${c.before})
    ORDER BY minted_at DESC LIMIT ${c.limit}`);
  return rows.map((r) => ({
    id: `nft:${r.token_id}`,
    kind: "nft",
    at: new Date(r.minted_at).toISOString(),
    fund: r.fund,
    account: r.owner,
    title: `${r.title} minted to ${who(r.owner, c.root)}`,
    detail: null,
    usd: null,
    txHash: r.tx_hash,
    url: null,
  }));
}

const UNIVERSE_IDS = UNIVERSE.map((a) => a.id);

async function news(db: Db, c: Ctx): Promise<FeedItem[]> {
  if (c.fund) return [];
  const rows = await db.execute<{ id: number; title: string; url: string; domain: string; published_at: Date; reason: string | null; sentiment: number | null }>(dz.sql`
    SELECT id, title, url, domain, published_at, reason, sentiment FROM world_news
    WHERE tag_status = 'scored' AND companies && ${pgArray(UNIVERSE_IDS)}::text[] AND (${c.before}::timestamptz IS NULL OR published_at <= ${c.before})
    ORDER BY published_at DESC, id DESC LIMIT ${c.limit}`);
  return rows.map((r) => ({
    id: `news:${r.id}`,
    kind: "news",
    at: new Date(r.published_at).toISOString(),
    fund: null,
    account: null,
    title: r.title,
    detail: r.reason ?? r.domain,
    usd: null,
    txHash: null,
    url: r.url,
  }));
}

export async function feedPage(db: Db, root: string, q: { kinds: FeedKind[]; fund: string | null; cursor?: string; limit: number }): Promise<FeedPage> {
  const cur = decodeCursor(q.cursor, isTimeCursor);
  const c: Ctx = { root, fund: q.fund, before: cur ? cur[0] : null, limit: q.limit + 1 };
  const want = new Set(q.kinds.length ? q.kinds : FEED_KINDS);
  const jobs: Promise<FeedItem[]>[] = [];
  if (want.has("move")) jobs.push(moves(db, c));
  if (want.has("flow")) jobs.push(flows(db, c));
  if (want.has("trade")) jobs.push(trades(db, c, ["pool_buy", "pool_sell"], "trade"));
  if (want.has("raid")) jobs.push(trades(db, c, ["cross_trade"], "raid"));
  if (want.has("fee")) jobs.push(trades(db, c, ["buyback"], "fee"));
  if (want.has("reputation")) jobs.push(reputation(db, c));
  if (want.has("promise")) jobs.push(promises(db, c));
  if (want.has("nft")) jobs.push(nfts(db, c));
  if (want.has("news")) jobs.push(news(db, c));
  const all = (await Promise.all(jobs)).flat();
  const after = (i: FeedItem) => !cur || i.at < cur[0] || (i.at === cur[0] && i.id < cur[1]);
  const sorted = all.filter(after).sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));
  const page = sorted.slice(0, q.limit);
  const last = page[page.length - 1];
  return { items: page, nextCursor: sorted.length > q.limit && last ? encodeCursor([last.at, last.id]) : null };
}

export { nearNum };
