import { dataItems, type NearEvent } from "../parse";

type Obj = Record<string, unknown>;

export const MICRO = 1_000_000;

export function s(o: Obj, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v !== "") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "bigint") return v.toString();
  }
  return null;
}

export function n(o: Obj, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export function b(o: Obj, ...keys: string[]): boolean | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "boolean") return v;
  }
  return null;
}

export function int(o: Obj, ...keys: string[]): string | null {
  const v = s(o, ...keys);
  return v && /^-?\d+$/.test(v) ? v : null;
}

export interface Weight {
  asset: string;
  bps: number;
}

export function weightsOf(v: unknown): Weight[] {
  const out: Weight[] = [];
  if (typeof v === "string") {

    for (const part of v.split(",")) {
      const i = part.lastIndexOf(":");
      if (i <= 0) continue;
      const bps = Number(part.slice(i + 1));
      if (Number.isFinite(bps)) out.push({ asset: part.slice(0, i).trim(), bps });
    }
  } else if (Array.isArray(v)) {
    for (const it of v) {
      if (Array.isArray(it) && typeof it[0] === "string") {
        const bps = Number(it[1]);
        if (Number.isFinite(bps)) out.push({ asset: it[0], bps });
      } else if (it && typeof it === "object") {
        const o = it as Obj;
        const asset = s(o, "asset", "id", "ticker");
        const bps = n(o, "bps", "weight_bps", "weight");
        if (asset && bps !== null) out.push({ asset, bps });
      }
    }
  } else if (v && typeof v === "object") {
    for (const [asset, bps] of Object.entries(v as Obj)) {
      const x = Number(bps);
      if (Number.isFinite(x)) out.push({ asset, bps: x });
    }
  }
  return out.filter((w) => w.bps > 0).sort((a, b) => b.bps - a.bps || (a.asset < b.asset ? -1 : 1));
}

export function turnoverBps(prev: Weight[], prevCash: number, next: Weight[], nextCash: number): number {
  const m = new Map<string, number>();
  for (const w of prev) m.set(w.asset, -w.bps);
  for (const w of next) m.set(w.asset, (m.get(w.asset) ?? 0) + w.bps);
  let sum = Math.abs(nextCash - prevCash);
  for (const d of m.values()) sum += Math.abs(d);
  return Math.round(sum / 2);
}

export const microToUsd = (v: string | null | undefined): number => (v ? Number(v) / MICRO : 0);

export function usdField(o: Obj, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v) / MICRO;
    if (typeof v === "number" && Number.isFinite(v)) return Number.isInteger(v) ? v / MICRO : v;
    if (typeof v === "string" && /^-?\d*\.\d+$/.test(v)) return Number(v);
  }
  return null;
}

export function coinsToNum(raw: string | null | undefined, decimals = 18): number {
  if (!raw) return 0;
  const neg = raw.startsWith("-");
  const d = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const v = Number(`${d.slice(0, d.length - decimals)}.${d.slice(d.length - decimals, d.length - decimals + 8)}`);
  return neg ? -v : v;
}

export const yoctoToNear = (raw: string | null | undefined): number => coinsToNum(raw, 24);

export type FundRecord =
  | { kind: "fund_created"; fund: string; name: string | null; manager: string | null; mandate: string | null; seedUsd: number | null; caps: Obj; data: Obj }
  | { kind: "commit"; fund: string; bell: number | null; hash: string }
  | { kind: "reveal"; fund: string; bell: number | null; weights: Weight[]; cashBps: number; edition: number | null; note: string | null }
  | { kind: "nav"; bell: number; pricesHash: string | null; navs: { fund: string; navMicro: string; valueMicro: string; supply: string | null }[] }
  | { kind: "order_queued"; id: string; fund: string; account: string; side: "subscribe" | "redeem"; amount: string; amountUsd: number | null }
  | { kind: "order_filled"; id: string; fund: string | null; account: string | null; side: "subscribe" | "redeem" | null; filled: string | null; coins: string | null; near: string | null; navMicro: string | null; bell: number | null; exitLoadBps: number | null; usd: number | null }
  | { kind: "order_cancelled"; id: string }
  | { kind: "swap"; fund: string; account: string; side: "buy" | "sell"; near: string; coins: string; priceMicro: string | null }
  | { kind: "cross_trade"; fund: string; target: string; side: "buy" | "sell"; usd: number | null; coins: string; near: string }
  | { kind: "fee"; fund: string; feeKind: string; amount: string; usd: number | null; to: string | null; quarter: number | null }
  | { kind: "buyback"; fund: string; near: string; coins: string }
  | { kind: "promise_set"; fund: string; season: number; targetBps: number; bondBps: number; bondCoins: string | null }
  | { kind: "promise_settled"; fund: string; season: number; kept: boolean; compensation: string | null; userReturnBps: number | null }
  | { kind: "reputation_anchored"; quarter: number | null; root: string | null; scores: { fund: string; score: number }[] }
  | { kind: "quarter_closed"; season: number | null; quarter: number; spyReturnBps: number | null; results: { fund: string; returnBps: number | null; beatSpy: boolean | null; navMicro: string | null }[] }
  | { kind: "dna_revealed"; fund: string; season: number | null; traits: Record<string, number> }
  | { kind: "badge_minted"; tokenId: string; account: string; badge: string; fund: string | null; season: number | null }
  | { kind: "seat_auction_started"; fund: string; tokenId: string | null; endsAtMs: number | null }
  | { kind: "season_settled"; season: number; winner: string | null; dna: Record<string, Obj> | null }
  | { kind: "season_started"; season: number; data: Obj }
  | { kind: "nft_mint"; owner: string; tokenIds: string[]; memo: string | null }
  | { kind: "nft_transfer"; from: string; to: string; tokenIds: string[] }
  | { kind: "nft_burn"; owner: string; tokenIds: string[] }
  | { kind: "seat_bid"; fund: string; bidder: string; amount: string; endsAtMs: number | null }
  | { kind: "seat_won"; fund: string; winner: string; amount: string | null; tokenId: string | null }
  | { kind: "mt_mint"; owner: string; tokenIds: string[]; amounts: string[] }
  | { kind: "mt_burn"; owner: string; tokenIds: string[]; amounts: string[] }
  | { kind: "mt_transfer"; from: string; to: string; tokenIds: string[]; amounts: string[] }
  | { kind: "fund_status"; fund: string; status: string }
  | { kind: "raw" };

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);
const amtList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : v === undefined || v === null ? [] : [String(v)]);

function side(v: string | null): "buy" | "sell" {
  return v && /sell|coin_for_near|out/i.test(v) ? "sell" : "buy";
}

export function decodeFundEvent(ev: NearEvent): FundRecord[] {
  const out: FundRecord[] = [];
  for (const d of dataItems(ev.data)) {
    if (ev.standard === "drixie" && ev.event === "fee_paid") out.push(...decodeFees(d));
    else out.push(decodeOne(ev.standard, ev.event, d));
  }
  return out;
}

export function decodeFees(d: Obj): FundRecord[] {
  const fund = s(d, "fund") ?? "";
  const quarter = n(d, "quarter");
  const out: FundRecord[] = [];
  const mg = usdField(d, "mgmt_usd");
  const pf = usdField(d, "perf_usd");
  if (mg) out.push({ kind: "fee", fund, feeKind: "management", amount: "0", usd: mg, to: null, quarter });
  if (pf) out.push({ kind: "fee", fund, feeKind: "performance", amount: "0", usd: pf, to: null, quarter });
  const seat = int(d, "near_seat");
  if (seat && seat !== "0") out.push({ kind: "fee", fund, feeKind: "seat", amount: seat, usd: null, to: s(d, "seat_owner"), quarter });
  const prot = int(d, "near_protocol");
  if (prot && prot !== "0") out.push({ kind: "fee", fund, feeKind: "protocol", amount: prot, usd: null, to: null, quarter });
  if (!out.length && int(d, "amount", "near")) out.push({ kind: "fee", fund, feeKind: s(d, "kind", "fee", "type") ?? "fee", amount: int(d, "amount", "near") ?? "0", usd: usdField(d, "usd"), to: s(d, "to"), quarter });
  return out;
}

function decodeOne(standard: string, event: string, d: Obj): FundRecord {
  if (standard === "nep171") {
    if (event === "nft_mint") return { kind: "nft_mint", owner: s(d, "owner_id") ?? "", tokenIds: strList(d.token_ids), memo: s(d, "memo") };
    if (event === "nft_transfer") return { kind: "nft_transfer", from: s(d, "old_owner_id") ?? "", to: s(d, "new_owner_id") ?? "", tokenIds: strList(d.token_ids) };
    if (event === "nft_burn") return { kind: "nft_burn", owner: s(d, "owner_id") ?? "", tokenIds: strList(d.token_ids) };
    return { kind: "raw" };
  }
  if (standard === "nep245") {
    if (event === "mt_mint") return { kind: "mt_mint", owner: s(d, "owner_id") ?? "", tokenIds: strList(d.token_ids), amounts: amtList(d.amounts) };
    if (event === "mt_burn") return { kind: "mt_burn", owner: s(d, "owner_id") ?? "", tokenIds: strList(d.token_ids), amounts: amtList(d.amounts) };
    if (event === "mt_transfer")
      return { kind: "mt_transfer", from: s(d, "old_owner_id") ?? "", to: s(d, "new_owner_id") ?? "", tokenIds: strList(d.token_ids), amounts: amtList(d.amounts) };
    return { kind: "raw" };
  }
  const fund = s(d, "fund", "fund_id", "id") ?? "";
  switch (event) {
    case "fund_created":
      return {
        kind: "fund_created",
        fund,
        name: s(d, "name"),
        manager: s(d, "manager", "agent", "manager_id"),
        mandate: s(d, "mandate"),
        seedUsd: usdField(d, "seed_usd", "seed_micro_usd", "seed_usd_micro"),
        caps: (d.caps as Obj | undefined) ?? d,
        data: d,
      };
    case "rebalance_committed":
      return { kind: "commit", fund, bell: n(d, "bell"), hash: s(d, "hash", "commit_hash") ?? "" };
    case "rebalance_revealed":
      return {
        kind: "reveal",
        fund,
        bell: n(d, "bell"),
        weights: weightsOf(d.weights),
        cashBps: n(d, "cash_bps", "cash") ?? 0,
        edition: n(d, "edition", "card_edition"),
        note: s(d, "note"),
      };
    case "nav_posted": {
      const navsRaw = Array.isArray(d.navs) ? (d.navs as Obj[]) : fund ? [d] : [];
      const navs = navsRaw
        .map((x) => ({
          fund: s(x, "fund", "fund_id") ?? "",
          navMicro: int(x, "nav_micro_usd", "nav_micro", "nav") ?? "0",
          valueMicro: int(x, "value_micro_usd", "value_micro", "value") ?? "0",
          supply: int(x, "supply"),
        }))
        .filter((x) => x.fund);
      return { kind: "nav", bell: n(d, "bell") ?? 0, pricesHash: s(d, "prices_hash"), navs };
    }
    case "order_queued": {
      const sd = s(d, "side", "kind");
      return {
        kind: "order_queued",
        id: s(d, "id", "order_id") ?? "",
        fund,
        account: s(d, "account", "account_id", "owner") ?? "",
        side: sd && /redeem|cash/i.test(sd) ? "redeem" : "subscribe",
        amount: int(d, "amount", "deposit", "coins", "near") ?? "0",
        amountUsd: usdField(d, "usd", "usd_micro", "amount_micro_usd"),
      };
    }
    case "order_filled": {
      const sd = s(d, "side", "kind");
      return {
        kind: "order_filled",
        id: s(d, "id", "order_id") ?? "",
        fund: fund || null,
        account: s(d, "account", "account_id", "owner"),
        side: sd ? (/redeem|cash/i.test(sd) ? "redeem" : "subscribe") : null,
        filled: int(d, "filled", "out", "amount_out"),
        coins: int(d, "coins"),
        near: int(d, "near", "paid", "near_out", "payout"),
        navMicro: int(d, "nav_micro_usd", "nav_micro", "nav"),
        bell: n(d, "bell"),
        exitLoadBps: n(d, "exit_load_bps"),
        usd: usdField(d, "usd", "usd_micro", "value_micro_usd"),
      };
    }
    case "order_cancelled":
    case "order_refunded":
      return { kind: "order_cancelled", id: s(d, "id", "order_id") ?? "" };
    case "swap": {
      const sd = s(d, "side", "direction");
      const isSell = side(sd) === "sell";
      return {
        kind: "swap",
        fund,
        account: s(d, "account", "account_id", "trader") ?? "",
        side: isSell ? "sell" : "buy",
        near: int(d, isSell ? "near_out" : "near_in", "near", "amount_near") ?? "0",
        coins: int(d, isSell ? "coins_in" : "coins_out", "coins", "amount_coins") ?? "0",
        priceMicro: int(d, "price_micro_usd", "price_micro"),
      };
    }
    case "cross_trade":
      return {
        kind: "cross_trade",
        fund,
        target: s(d, "target", "target_fund") ?? "",
        side: side(s(d, "side")),
        usd: usdField(d, "usd", "usd_micro", "micro_usd"),
        coins: int(d, "coins") ?? "0",
        near: int(d, "near") ?? "0",
      };
    case "fee_paid":
      return {
        kind: "fee",
        fund,
        feeKind: s(d, "kind", "fee", "type") ?? "fee",
        amount: int(d, "amount", "near") ?? "0",
        usd: usdField(d, "usd", "usd_micro", "micro_usd"),
        to: s(d, "to", "receiver", "account"),
        quarter: n(d, "quarter"),
      };
    case "buyback_burn":
      return { kind: "buyback", fund, near: int(d, "near", "near_in") ?? "0", coins: int(d, "coins", "burned", "coins_burned") ?? "0" };
    case "promise_set":
      return {
        kind: "promise_set",
        fund,
        season: n(d, "season") ?? 0,
        targetBps: n(d, "target_bps") ?? 0,
        bondBps: n(d, "bond_bps") ?? 0,
        bondCoins: int(d, "bond_coins", "bond"),
      };
    case "promise_settled":
      return {
        kind: "promise_settled",
        fund,
        season: n(d, "season") ?? 0,
        kept: b(d, "kept") ?? !(int(d, "coins", "minted", "compensation") && int(d, "coins", "minted", "compensation") !== "0"),
        compensation: int(d, "coins", "minted", "compensation"),
        userReturnBps: n(d, "user_return_bps", "return_bps"),
      };
    case "reputation_anchored":
      return {
        kind: "reputation_anchored",
        quarter: n(d, "quarter", "day"),
        root: s(d, "root"),
        scores: (Array.isArray(d.scores) ? (d.scores as Obj[]) : [])
          .map((x) => ({ fund: s(x, "fund") ?? "", score: n(x, "score") ?? 0 }))
          .filter((x) => x.fund),
      };
    case "quarter_closed":
      return {
        kind: "quarter_closed",
        season: n(d, "season"),
        quarter: n(d, "quarter") ?? 0,
        spyReturnBps: n(d, "spy_return_bps"),
        results: (Array.isArray(d.funds) ? (d.funds as Obj[]) : [])
          .map((x) => ({ fund: s(x, "fund") ?? "", returnBps: n(x, "return_bps"), beatSpy: b(x, "beat_spy"), navMicro: int(x, "nav") }))
          .filter((x) => x.fund),
      };
    case "dna_revealed": {
      const traits: Record<string, number> = {};
      for (const k of ["risk", "patience", "greed", "loyalty", "smarts"]) {
        const v = n(d, k);
        if (v !== null) traits[k] = v;
      }
      return { kind: "dna_revealed", fund, season: n(d, "season"), traits };
    }
    case "badge_minted":
      return { kind: "badge_minted", tokenId: s(d, "token_id") ?? "", account: s(d, "account", "owner") ?? "", badge: s(d, "badge", "kind") ?? "badge", fund: s(d, "fund"), season: n(d, "season") };
    case "seat_auction_started":
      return { kind: "seat_auction_started", fund, tokenId: s(d, "token_id"), endsAtMs: nsToMs(d, "ends_at_ns") };
    case "season_settled":
      return { kind: "season_settled", season: n(d, "season") ?? 0, winner: s(d, "winner"), dna: (d.dna as Record<string, Obj> | undefined) ?? null };
    case "season_started":
      return { kind: "season_started", season: n(d, "season") ?? 0, data: d };
    case "seat_bid":
      return { kind: "seat_bid", fund, bidder: s(d, "bidder", "account") ?? "", amount: int(d, "near", "amount", "bid") ?? "0", endsAtMs: n(d, "ends_at_ms") ?? nsToMs(d, "ends_at_ns") };
    case "seat_won":
      return { kind: "seat_won", fund, winner: s(d, "winner", "account", "owner") ?? "", amount: int(d, "near", "amount", "price"), tokenId: s(d, "token_id") };
    case "fund_autopilot":
    case "fund_liquidated":
    case "fund_retired":
    case "fund_status":
      return { kind: "fund_status", fund, status: event === "fund_liquidated" || event === "fund_retired" ? "liquidated" : (s(d, "status") ?? "autopilot") };
    default:
      return { kind: "raw" };
  }
}

function nsToMs(o: Obj, key: string): number | null {
  const v = int(o, key);
  return v ? Number(BigInt(v) / 1_000_000n) : null;
}

export function eventTags(d: Obj): { fund: string | null; account: string | null } {
  return {
    fund: s(d, "fund", "fund_id"),
    account: s(d, "account", "account_id", "owner_id", "owner", "bidder", "new_owner_id", "trader"),
  };
}
