import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { amount, height, tstz } from "./columns";

export interface AssetSource {
  label: string;
  url: string;
}

export interface FundCaps {
  startupCapBps: number;
  basketCapBps: number;
  indiaCapBps: number;
  cashMaxBps: number;
  minHoldingBps: number;
  maxHoldingBps: number;
  maxStepBps: number;
  maxSwapsPerBell: number;
  turnoverAllowanceBps: number;
}

export interface WeightRow {
  asset: string;
  bps: number;
}

export const funds = pgTable("funds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mandate: text("mandate").notNull(),

  manager: text("manager").notNull(),
  caps: jsonb("caps").$type<FundCaps>().notNull(),
  seedUsd: doublePrecision("seed_usd").notNull().default(0),

  status: text("status").notNull().default("active"),

  supply: amount("supply").notNull().default("0"),
  managerStake: amount("manager_stake").notNull().default("0"),
  navMicro: amount("nav_micro").notNull().default("10000000"),
  valueMicro: amount("value_micro").notNull().default("0"),
  lastBell: integer("last_bell"),
  weights: jsonb("weights").$type<WeightRow[]>().notNull().default(sql`'[]'::jsonb`),
  cashBps: integer("cash_bps").notNull().default(0),
  reputation: doublePrecision("reputation").notNull().default(60),
  brainTier: text("brain_tier").notNull().default("primary"),
  poolNear: amount("pool_near").notNull().default("0"),
  poolCoin: amount("pool_coin").notNull().default("0"),
  poolFeeBps: integer("pool_fee_bps").notNull().default(30),
  dna: jsonb("dna").$type<Record<string, number> | null>(),
  dnaCommitted: boolean("dna_committed").notNull().default(false),
  lastNote: text("last_note"),

  raw: jsonb("raw").$type<Record<string, unknown>>(),
  createdAt: tstz("created_at"),
  createdTx: text("created_tx"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const fundBells = pgTable("fund_bells", {
  bell: integer("bell").primaryKey(),
  at: tstz("at").notNull(),
  pricesHash: text("prices_hash"),

  spy: doublePrecision("spy"),
  txHash: text("tx_hash"),
});

export const fundNavHistory = pgTable(
  "fund_nav_history",
  {
    fund: text("fund").notNull(),
    bell: integer("bell").notNull(),
    at: tstz("at").notNull(),
    navMicro: amount("nav_micro").notNull(),
    valueMicro: amount("value_micro").notNull(),
    nav: doublePrecision("nav").notNull(),
    valueUsd: doublePrecision("value_usd").notNull(),
    supply: amount("supply"),
    spy: doublePrecision("spy"),
    txHash: text("tx_hash"),
  },
  (t) => [primaryKey({ columns: [t.fund, t.bell] }), index("fund_nav_history_at_idx").on(t.at)],
);

export const fundCommits = pgTable(
  "fund_commits",
  {
    fund: text("fund").notNull(),
    bell: integer("bell").notNull(),
    hash: text("hash").notNull(),
    at: tstz("at").notNull(),
    revealed: boolean("revealed").notNull().default(false),
    txHash: text("tx_hash"),
  },
  (t) => [primaryKey({ columns: [t.fund, t.bell] })],
);

export const fundWeightsHistory = pgTable(
  "fund_weights_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fund: text("fund").notNull(),
    bell: integer("bell").notNull(),
    at: tstz("at").notNull(),
    weights: jsonb("weights").$type<WeightRow[]>().notNull(),
    cashBps: integer("cash_bps").notNull().default(0),
    prevWeights: jsonb("prev_weights").$type<WeightRow[]>().notNull().default(sql`'[]'::jsonb`),
    prevCashBps: integer("prev_cash_bps").notNull().default(0),

    turnoverBps: integer("turnover_bps").notNull().default(0),
    note: text("note"),
    edition: integer("edition"),
    txHash: text("tx_hash").notNull(),
    receiptId: text("receipt_id").notNull(),
    logIndex: integer("log_index").notNull(),
  },
  (t) => [
    uniqueIndex("fund_weights_history_receipt_uq").on(t.receiptId, t.logIndex),
    index("fund_weights_history_fund_bell_idx").on(t.fund, t.bell),
    index("fund_weights_history_at_idx").on(t.at),
  ],
);

export const fundOrders = pgTable(
  "fund_orders",
  {
    id: text("id").primaryKey(),
    fund: text("fund").notNull(),
    account: text("account").notNull(),

    side: text("side").notNull(),

    status: text("status").notNull().default("queued"),

    amount: amount("amount").notNull(),
    amountUsd: doublePrecision("amount_usd").notNull().default(0),

    filled: amount("filled"),
    fillNavMicro: amount("fill_nav_micro"),
    fillBell: integer("fill_bell"),
    exitLoadBps: integer("exit_load_bps"),
    queuedAt: tstz("queued_at").notNull(),
    filledAt: tstz("filled_at"),
    txHash: text("tx_hash"),
    fillTxHash: text("fill_tx_hash"),
  },
  (t) => [index("fund_orders_account_idx").on(t.account, t.queuedAt), index("fund_orders_fund_idx").on(t.fund, t.status)],
);

export const fundTrades = pgTable(
  "fund_trades",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fund: text("fund").notNull(),
    account: text("account").notNull(),

    kind: text("kind").notNull(),
    nearAmount: amount("near_amount").notNull().default("0"),
    coinAmount: amount("coin_amount").notNull().default("0"),

    priceUsd: doublePrecision("price_usd"),
    usd: doublePrecision("usd"),
    at: tstz("at").notNull(),
    txHash: text("tx_hash").notNull(),
    receiptId: text("receipt_id").notNull(),
    logIndex: integer("log_index").notNull(),
  },
  (t) => [
    uniqueIndex("fund_trades_receipt_uq").on(t.receiptId, t.logIndex, t.kind),
    index("fund_trades_fund_at_idx").on(t.fund, t.at),
    index("fund_trades_account_idx").on(t.account, t.at),
  ],
);

export const fundCandles = pgTable(
  "fund_candles",
  {
    fund: text("fund").notNull(),

    interval: text("interval").notNull(),
    bucket: tstz("bucket").notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volumeUsd: doublePrecision("volume_usd").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.fund, t.interval, t.bucket] })],
);

export const fundBalances = pgTable(
  "fund_balances",
  {
    fund: text("fund").notNull(),
    account: text("account").notNull(),
    coins: amount("coins").notNull().default("0"),

    costUsd: doublePrecision("cost_usd").notNull().default(0),
    firstAt: tstz("first_at"),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.fund, t.account] }), index("fund_balances_account_idx").on(t.account)],
);

export const fundCrossHoldings = pgTable(
  "fund_cross_holdings",
  {
    holder: text("holder").notNull(),
    target: text("target").notNull(),
    coins: amount("coins").notNull().default("0"),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.holder, t.target] })],
);

export const fundReputationEvents = pgTable(
  "fund_reputation_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fund: text("fund").notNull(),
    at: tstz("at").notNull(),
    kind: text("kind").notNull(),
    delta: doublePrecision("delta").notNull(),
    score: doublePrecision("score").notNull(),
    reason: text("reason").notNull(),
    bell: integer("bell"),

    source: text("source").notNull(),

    key: text("key").notNull(),
  },
  (t) => [uniqueIndex("fund_reputation_events_key_uq").on(t.key), index("fund_reputation_events_fund_at_idx").on(t.fund, t.at)],
);

export const fundReputationScores = pgTable(
  "fund_reputation_scores",
  {
    fund: text("fund").notNull(),
    at: tstz("at").notNull(),
    score: doublePrecision("score").notNull(),
    anchored: boolean("anchored").notNull().default(false),
    quarter: integer("quarter"),
    root: text("root"),
    txHash: text("tx_hash"),
  },
  (t) => [primaryKey({ columns: [t.fund, t.at] })],
);

export const fundNfts = pgTable(
  "fund_nfts",
  {
    tokenId: text("token_id").primaryKey(),

    kind: text("kind").notNull(),
    owner: text("owner").notNull(),
    fund: text("fund"),
    title: text("title").notNull(),
    description: text("description"),
    edition: integer("edition"),
    bell: integer("bell"),
    season: integer("season"),
    badgeKind: text("badge_kind"),
    soulbound: boolean("soulbound").notNull().default(false),
    extra: jsonb("extra").$type<Record<string, unknown>>(),
    burned: boolean("burned").notNull().default(false),
    mintedAt: tstz("minted_at").notNull(),
    txHash: text("tx_hash"),
  },
  (t) => [
    index("fund_nfts_owner_idx").on(t.owner),
    index("fund_nfts_kind_fund_idx").on(t.kind, t.fund),
    uniqueIndex("fund_nfts_basket_edition_uq").on(t.fund, t.edition).where(sql`kind = 'basket'`),
  ],
);

export const fundPromises = pgTable(
  "fund_promises",
  {
    fund: text("fund").notNull(),
    season: integer("season").notNull(),
    targetBps: integer("target_bps").notNull(),
    bondBps: integer("bond_bps").notNull(),
    bondCoins: amount("bond_coins"),

    status: text("status").notNull().default("open"),

    compensation: amount("compensation"),
    userReturnBps: integer("user_return_bps"),
    setAt: tstz("set_at").notNull(),
    settledAt: tstz("settled_at"),
    txHash: text("tx_hash"),
  },
  (t) => [primaryKey({ columns: [t.fund, t.season] })],
);

export const fundSeasons = pgTable("fund_seasons", {
  season: integer("season").primaryKey(),
  startedAt: tstz("started_at"),
  bellSecs: integer("bell_secs").notNull().default(900),
  quarterSecs: integer("quarter_secs").notNull().default(86400),
  quarters: smallint("quarters").notNull().default(4),
  gameUsdPerNear: doublePrecision("game_usd_per_near").notNull().default(100),
  settledAt: tstz("settled_at"),
  winner: text("winner"),
  dnaRevealed: boolean("dna_revealed").notNull().default(false),

  startValues: jsonb("start_values").$type<Record<string, number>>(),
  raw: jsonb("raw").$type<Record<string, unknown>>(),
});

export const fundQuarters = pgTable(
  "fund_quarters",
  {
    season: integer("season").notNull(),
    quarter: integer("quarter").notNull(),
    closedAt: tstz("closed_at"),
    winner: text("winner"),

    results: jsonb("results").$type<Record<string, { ret: number | null; vsSpy: number | null }>>(),
    spyRet: doublePrecision("spy_ret"),
    txHash: text("tx_hash"),
  },
  (t) => [primaryKey({ columns: [t.season, t.quarter] })],
);

export const fundFees = pgTable(
  "fund_fees",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fund: text("fund").notNull(),

    kind: text("kind").notNull(),

    amount: amount("amount").notNull().default("0"),
    usd: doublePrecision("usd"),
    to: text("to"),
    quarter: integer("quarter"),
    at: tstz("at").notNull(),
    txHash: text("tx_hash").notNull(),
    receiptId: text("receipt_id").notNull(),
    logIndex: integer("log_index").notNull(),
  },
  (t) => [uniqueIndex("fund_fees_receipt_uq").on(t.receiptId, t.logIndex, t.kind), index("fund_fees_fund_idx").on(t.fund, t.at)],
);

export const fundSeatAuctions = pgTable("fund_seat_auctions", {
  fund: text("fund").primaryKey(),
  open: boolean("open").notNull().default(true),
  highBidder: text("high_bidder"),
  highBid: amount("high_bid"),
  endsAt: tstz("ends_at"),
  winner: text("winner"),
  settledAt: tstz("settled_at"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const fundBrainBills = pgTable(
  "fund_brain_bills",
  {

    id: text("id").primaryKey(),
    fund: text("fund").notNull(),
    at: tstz("at").notNull().defaultNow(),
    bell: integer("bell"),

    tier: text("tier").notNull(),

    think: text("think").notNull().default("normal"),
    aiCostUsd: doublePrecision("ai_cost_usd").notNull().default(0),
    multiplier: doublePrecision("multiplier").notNull().default(20000),
    usd: doublePrecision("usd").notNull(),

    chargedBell: integer("charged_bell"),
  },
  (t) => [index("fund_brain_bills_fund_at_idx").on(t.fund, t.at)],
);

export const fundNotes = pgTable(
  "fund_notes",
  {
    fund: text("fund").notNull(),
    bell: integer("bell").notNull(),
    note: text("note").notNull(),
    think: text("think").notNull().default("normal"),
    tier: text("tier").notNull().default("primary"),
    autopilot: boolean("autopilot").notNull().default(false),
    adjusted: boolean("adjusted").notNull().default(false),
    at: tstz("at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fund, t.bell] }), index("fund_notes_at_idx").on(t.at)],
);

export const fundEvents = pgTable(
  "fund_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    event: text("event").notNull(),
    fund: text("fund"),
    account: text("account"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    at: tstz("at").notNull(),
    blockHeight: height("block_height").notNull(),
    txHash: text("tx_hash").notNull(),
    receiptId: text("receipt_id").notNull(),
    logIndex: integer("log_index").notNull(),
  },
  (t) => [
    uniqueIndex("fund_events_receipt_uq").on(t.receiptId, t.logIndex),
    index("fund_events_event_at_idx").on(t.event, t.at),
    index("fund_events_fund_at_idx").on(t.fund, t.at),
    index("fund_events_at_idx").on(t.at),
  ],
);

export const fundState = pgTable("fund_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const fundCursor = pgTable("fund_cursor", {
  id: text("id").primaryKey(),
  contract: text("contract").notNull(),
  height: height("height").notNull(),
  blockHash: text("block_hash"),
  deployedAt: text("deployed_at"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const riskProfiles = pgTable(
  "risk_profiles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    account: text("account"),
    answers: jsonb("answers").$type<Record<string, number>>().notNull(),
    profile: text("profile").notNull(),
    points: smallint("points").notNull(),
    recommended: jsonb("recommended").$type<string[]>().notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("risk_profiles_account_idx").on(t.account, t.createdAt)],
);
