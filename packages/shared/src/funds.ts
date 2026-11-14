import type { Page } from "./types";

export const FUND_IDS = ["atlas", "meridian", "nova", "orion", "kite"] as const;

export type SeedFundId = (typeof FUND_IDS)[number];
export type FundId = string;

export const FUND_COIN_DECIMALS = 18;
export const MICRO_USD = 1_000_000;
export const GAME_USD_PER_NEAR_DEFAULT = 100;
export const FUND_EVENT_STANDARD = "drixie";
export const FUND_EVENT_VERSION = "1.0.0";
export const NAV_PORT = 4700;
export const BENCHMARK_SYMBOL = "SPY";
export const LAUNCH_NAV_USD = 10;
export const REPUTATION_START = 60;

export const BASKETS = ["ai_chips", "big_tech", "finance", "energy_ev", "consumer", "healthcare", "india", "startups", "crypto"] as const;
export type BasketId = (typeof BASKETS)[number];
export const BASKET_LABELS: Record<BasketId, string> = {
  ai_chips: "AI & Chips",
  big_tech: "Big Tech",
  finance: "Banks & Finance",
  energy_ev: "Energy & EV",
  consumer: "Consumer",
  healthcare: "Healthcare",
  india: "India Leaders",
  startups: "Startups (estimated)",
  crypto: "Crypto (24/7)",
};

export type AssetKind = "stock" | "startup" | "crypto";
export type AssetRegion = "us" | "india" | "private" | "global";

export type Mandate = "conservative" | "balanced" | "growth" | "contrarian" | "aggressive";
export type BrainTier = "best" | "primary" | "small";
export type RiskProfileId = "conservative" | "moderate" | "aggressive";
export type FundStatus = "active" | "autopilot" | "liquidated";

export const FUND_COLORS: Record<SeedFundId, "cobalt" | "teal" | "plum" | "gold" | "clay"> = {
  atlas: "cobalt",
  meridian: "teal",
  nova: "plum",
  orion: "gold",
  kite: "clay",
};

export interface FundSeedParams {
  id: SeedFundId;
  name: string;
  mandate: Mandate;
  mandateLine: string;
  seedUsd: number;
  startupCapBps: number;
  basketCapBps: number;
  turnoverAllowancePct: number;

  cryptoCapBps: number;
}
export const FUND_SEEDS: Record<SeedFundId, FundSeedParams> = {
  atlas: { id: "atlas", name: "Atlas", mandate: "conservative", mandateLine: "Conservative: large caps, banks, dividends", seedUsd: 5_000_000, startupCapBps: 1000, basketCapBps: 3000, turnoverAllowancePct: 40, cryptoCapBps: 500 },
  meridian: { id: "meridian", name: "Meridian", mandate: "balanced", mandateLine: "Balanced", seedUsd: 2_500_000, startupCapBps: 2000, basketCapBps: 3500, turnoverAllowancePct: 80, cryptoCapBps: 1000 },
  nova: { id: "nova", name: "Nova", mandate: "growth", mandateLine: "Growth: AI, chips, tech, startups", seedUsd: 1_500_000, startupCapBps: 3000, basketCapBps: 4500, turnoverAllowancePct: 120, cryptoCapBps: 2000 },
  orion: { id: "orion", name: "Orion", mandate: "contrarian", mandateLine: "Contrarian: buys what has fallen", seedUsd: 1_000_000, startupCapBps: 2000, basketCapBps: 4000, turnoverAllowancePct: 100, cryptoCapBps: 1000 },
  kite: { id: "kite", name: "Kite", mandate: "aggressive", mandateLine: "Aggressive: startups and high beta", seedUsd: 500_000, startupCapBps: 4000, basketCapBps: 5000, turnoverAllowancePct: 160, cryptoCapBps: 3000 },
};

export interface WeightEntry {

  asset: string;
  bps: number;
}

export interface FundRiskCaps {
  startupCapBps: number;
  basketCapBps: number;

  cryptoCapBps?: number;
  indiaCapBps: number;
  cashMaxBps: number;
  minHoldingBps: number;
  maxHoldingBps: number;
  maxStepBps: number;
  maxSwapsPerBell: number;
  turnoverAllowancePct: number;
}

export interface ReputationBadge {
  score: number;

  tone: "red" | "amber" | "green";
}

export interface FundCandle {

  t: string;
  o: number;
  h: number;
  l: number;
  c: number;

  v: number;
}
export type FundCandleInterval = "5m" | "15m" | "1h" | "1d";

export interface Sourced {
  label: string;
  url: string;
}

export interface FundRow {
  id: FundId;
  name: string;
  mandate: Mandate;
  mandateLine: string;
  color: string;
  status: FundStatus;

  nav: number;

  coinPrice: number | null;

  premium: number | null;

  ret1d: number | null;

  retSeason: number | null;

  vsSpy: number | null;

  aum: number;

  outsideHolders: number;

  holderCount: number;
  reputation: number;
  brainTier: BrainTier;
  nextBellAt: string | null;

  spark: number[];
}

export interface FundsResponse {
  items: FundRow[];

  spySeason: number | null;
  nextBellAt: string | null;
  lastBell: number | null;

  waiting: boolean;
  updatedAt: string | null;
}

export interface Holding {
  asset: string;
  name: string;
  basket: BasketId;
  kind: AssetKind;
  estimated: boolean;
  bps: number;

  price: number | null;

  ret1bell: number | null;
  ret1d: number | null;
  retSinceEntry: number | null;

  sinceBell: number | null;
}

export interface FundPromise {
  season: number;
  targetBps: number;
  bondBps: number;

  bondUsd: number | null;

  progressPct: number | null;
  status: "open" | "kept" | "missed";

  compensation: string | null;
}

export interface FundDna {
  risk: number;
  patience: number;
  greed: number;
  loyalty: number;
  smarts: number;
}

export interface SeatInfo {
  tokenId: string | null;
  owner: string | null;

  feesEarned: string;
  auction: SeatAuction | null;
}

export interface SeatAuction {
  fund: FundId;
  open: boolean;
  highBidder: string | null;

  highBid: string | null;
  endsAt: string | null;
}

export interface CrossHolding {
  holder: FundId;
  target: FundId;
  coins: string;
  coinsNum: number;

  valueUsd: number | null;

  pctOfTarget: number;
}

export interface FundDetail extends FundRow {
  manager: string;
  account: string | null;
  caps: FundRiskCaps;

  supply: string;
  supplyNum: number;

  managerStake: string;
  valueUsd: number;
  cashBps: number;
  holdings: Holding[];
  promise: FundPromise | null;

  dna: FundDna | null;
  dnaCommitted: boolean;

  brainBillSeason: number;
  brainBillQuarter: number;

  turnoverQuarterPct: number;
  pool: PoolInfo | null;
  seat: SeatInfo | null;
  crossHoldings: CrossHolding[];

  pendingCommit: { bell: number; at: string } | null;
  lastNote: string | null;
  createdAt: string | null;
}

export interface PoolInfo {

  nearReserve: string;
  coinReserve: string;

  price: number | null;
  feeBps: number;
  volume24hUsd: number;
}

export type NavRange = "1D" | "4D" | "SEASON" | "ALL";

export interface NavPoint {
  bell: number;
  t: string;
  nav: number;
  valueUsd: number;

  ret: number;

  spy: number | null;
}

export interface NavSeries {
  fund: FundId;
  range: NavRange;
  points: NavPoint[];
}

export interface FundCandles {
  fund: FundId;
  interval: FundCandleInterval;
  candles: FundCandle[];
}

export interface WeightDiff {
  asset: string;
  name: string;
  before: number;
  after: number;
  delta: number;
  kind: "enter" | "exit" | "up" | "down" | "same";
}

export interface Move {
  id: string;
  fund: FundId;
  fundName: string;
  bell: number;
  at: string;
  txHash: string | null;
  weights: WeightEntry[];
  cashBps: number;
  diffs: WeightDiff[];

  turnoverPct: number;

  note: string | null;

  edition: number | null;
}

export type MovesPage = Page<Move>;

export type ReputationEventKind =
  | "turnover_excess"
  | "flip_flop"
  | "pump_dump"
  | "broken_deal"
  | "missed_promise"
  | "front_running"
  | "low_churn"
  | "beat_spy"
  | "honoured_deal"
  | "kept_promise"
  | "anchor";

export interface ReputationEvent {
  id: string;
  fund: FundId;
  at: string;
  kind: ReputationEventKind;
  delta: number;

  score: number;

  reason: string;
  bell: number | null;
}

export interface ReputationPoint {
  t: string;
  score: number;
}

export interface ReputationHistory {
  fund: FundId;
  score: number;
  badge: ReputationBadge;
  points: ReputationPoint[];
  events: ReputationEvent[];

  anchoredAt: string | null;
  anchoredScore: number | null;
}

export interface Asset {
  id: string;
  name: string;
  basket: BasketId;
  kind: AssetKind;
  region: AssetRegion;

  price: number | null;

  localPrice: number | null;
  currency: "USD" | "INR";
  change1d: number | null;

  estimated: boolean;
  sources: Sourced[];
  updatedAt: string | null;

  heldBy: { fund: FundId; bps: number }[];
}

export interface AssetBasket {
  id: BasketId;
  label: string;
  assets: Asset[];
}

export interface AssetsResponse {
  baskets: AssetBasket[];
  benchmark: { symbol: string; price: number | null; change1d: number | null; updatedAt: string | null };
  updatedAt: string | null;
}

export interface AssetDetail extends Asset {

  valuation: { usd: number; date: string; source: Sourced } | null;

  news: FundsNewsItem[];
}

export interface AssetCandles {
  asset: string;
  interval: FundCandleInterval;
  candles: FundCandle[];
}

export interface FundsNewsItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: string;
  sentiment: -2 | -1 | 0 | 1 | 2 | null;
  reason: string | null;
  tickers: string[];
}

export interface FundPosition {
  fund: FundId;
  fundName: string;
  coins: string;
  coinsNum: number;
  nav: number;

  valueUsd: number;

  costUsd: number;
  pnlUsd: number;
  pnlPct: number | null;

  since: string | null;
  exitLoadPct: number;
}

export type OrderSide = "subscribe" | "redeem";
export type OrderStatus = "queued" | "filled" | "cancelled";

export interface FundOrder {
  id: string;
  fund: FundId;
  account: string;
  side: OrderSide;
  status: OrderStatus;

  amount: string;

  amountUsd: number;

  filled: string | null;
  fillNav: number | null;
  fillBell: number | null;
  queuedAt: string;
  filledAt: string | null;
  txHash: string | null;
}

export interface FundBadge {
  tokenId: string;
  kind: "season_winner" | "black_swan" | "early_backer" | "kept_faith";
  title: string;
  fund: FundId | null;
  season: number | null;
  mintedAt: string;
  imageUrl: string;
}

export interface FundPortfolio {
  account: string;
  totalValueUsd: number;
  totalCostUsd: number;
  pnlUsd: number;
  pnlPct: number | null;
  positions: FundPosition[];
  pendingOrders: FundOrder[];
  recentOrders: FundOrder[];
  badges: FundBadge[];
  promises: { fund: FundId; promise: FundPromise }[];
}

export interface RiskProfileRequest {

  drawdown: 0 | 1 | 2;

  horizon: 0 | 1 | 2;

  goal: 0 | 1 | 2;
}

export interface RiskQuestion {
  id: keyof RiskProfileRequest;
  question: string;
  answers: [string, string, string];
}

export const RISK_QUESTIONS: RiskQuestion[] = [
  { id: "drawdown", question: "If your money fell 20% in one day, you would…", answers: ["Sell to stop the loss", "Wait it out", "Buy more"] },
  { id: "horizon", question: "How long will you keep your money in?", answers: ["One quarter", "The whole season", "Many seasons"] },
  { id: "goal", question: "What do you want most?", answers: ["Steady, small swings", "Beat the market", "Big wins, even with big swings"] },
];

export interface RecommendedFund {
  fund: FundId;
  name: string;
  mandate: Mandate;

  score: number;

  mandateFit: number;
  reputation: number;
  seasonReturn: number | null;

  why: string;
}

export interface RiskProfileResponse {
  profile: RiskProfileId;

  points: number;
  label: string;
  summary: string;
  recommended: RecommendedFund[];
}

export interface SeasonClock {

  season: number;

  quarter: number;

  seasonIndex: number;
  quarterIndex: number;
  quarters: number;
  bell: number;
  bellSecs: number;
  quarterSecs: number;
  seasonStartedAt: string | null;
  quarterEndsAt: string | null;
  seasonEndsAt: string | null;
  nextBellAt: string | null;
  gameUsdPerNear: number;
}

export interface FundScoreRow {
  rank: number;
  fund: FundId;
  name: string;

  score: number;
  retSeason: number | null;
  vsSpy: number | null;
  outsideGrowthPct: number | null;
  reputation: number;
  promiseKept: boolean | null;
  parts: { vsSpy: number; outsideGrowth: number; reputation: number; promise: number };
}

export interface UserScoreRow {
  rank: number;
  account: string;
  handle: string | null;
  isHouse: boolean;
  retPct: number;
  valueUsd: number;
  costUsd: number;
}

export interface QuarterResult {
  season: number;
  quarter: number;
  closedAt: string | null;
  winner: FundId | null;

  returns: { fund: FundId; ret: number | null; vsSpy: number | null }[];
  spy: number | null;
}

export interface SeasonResponse {
  clock: SeasonClock | null;
  funds: FundScoreRow[];
  users: UserScoreRow[];
  quarters: QuarterResult[];
  trophies: FundNft[];
  dnaRevealed: boolean;
  settled: boolean;
}

export type FundNftKind = "seat" | "basket" | "badge" | "trophy";

export interface FundNft {
  tokenId: string;
  kind: FundNftKind;
  owner: string;
  fund: FundId | null;
  title: string;
  description: string | null;

  edition: number | null;
  bell: number | null;
  season: number | null;
  soulbound: boolean;
  imageUrl: string;
  metadataUrl: string;

  extra: Record<string, unknown> | null;
  mintedAt: string;
  txHash: string | null;
}

export type NftPage = Page<FundNft>;

export type FeedKind = "move" | "flow" | "trade" | "raid" | "reputation" | "news" | "nav" | "fee" | "promise" | "season" | "nft";

export interface FeedItem {
  id: string;
  kind: FeedKind;
  at: string;
  fund: FundId | null;
  account: string | null;

  title: string;
  detail: string | null;

  usd: number | null;
  txHash: string | null;
  url: string | null;
}

export type FeedPage = Page<FeedItem>;

export interface VaultInfo {

  balance: string;
  reserve: string;

  liabilitiesUsd: number;
  assetsUsd: number;

  coveragePct: number | null;
  updatedAt: string | null;
}

export type FundStreamTopic = "bell" | "nav" | "move" | "trade" | "reputation";
export const FUND_STREAM_TOPICS: FundStreamTopic[] = ["bell", "nav", "move", "trade", "reputation"];

export interface BellStreamEvent {
  topic: "bell";
  bell: number;
  at: string;
  nextBellAt: string | null;
  season: number;
  quarter: number;
}
export interface NavStreamEvent {
  topic: "nav";
  bell: number;
  at: string;
  navs: { fund: FundId; nav: number; valueUsd: number }[];
  pricesHash: string;
}
export interface MoveStreamEvent {
  topic: "move";
  move: Move;
}
export interface TradeStreamEvent {
  topic: "trade";
  fund: FundId;
  at: string;
  kind: "pool_buy" | "pool_sell" | "subscribe" | "redeem" | "cross_trade" | "buyback";
  account: string;
  usd: number | null;
  price: number | null;
  txHash: string | null;
}
export interface ReputationStreamEvent {
  topic: "reputation";
  event: ReputationEvent;
}
export type FundStreamEvent = BellStreamEvent | NavStreamEvent | MoveStreamEvent | TradeStreamEvent | ReputationStreamEvent;

export const FUND_STREAM_CHANNEL = "drixie:funds";

function numField(o: Record<string, unknown> | null | undefined, ...keys: string[]): number | null {
  if (!o) return null;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export function parseFundsClock(cfg: unknown, nowMs = Date.now()): SeasonClock {
  const c = (cfg && typeof cfg === "object" ? cfg : {}) as Record<string, unknown>;
  const nested = [c.clock, c.season_cfg, c.season].find((x) => x && typeof x === "object") as Record<string, unknown> | undefined;
  const pick = (...keys: string[]) => numField(nested, ...keys) ?? numField(c, ...keys);
  const bellSecs = pick("bell_secs") ?? 900;
  const quarterSecs = pick("quarter_secs") ?? 86400;
  const quarters = pick("quarters") ?? 4;
  const genesisNs = pick("genesis_ns", "season_start_ns", "start_ns");
  const genesisMs = pick("genesis_ms", "season_start_ms", "start_ms") ?? (genesisNs !== null ? Math.floor(genesisNs / 1e6) : null);
  const gameUsdPerNear = numField(c, "game_usd_per_near") ?? GAME_USD_PER_NEAR_DEFAULT;
  if (genesisMs === null) {
    const seasonIndex = numField(c, "season_index", "current_season") ?? 0;
    return {
      season: seasonIndex + 1,
      quarter: 1,
      seasonIndex,
      quarterIndex: seasonIndex * quarters,
      quarters,
      bell: numField(c, "last_nav_bell", "bell", "last_bell") ?? 0,
      bellSecs,
      quarterSecs,
      seasonStartedAt: null,
      quarterEndsAt: null,
      seasonEndsAt: null,
      nextBellAt: null,
      gameUsdPerNear,
    };
  }
  const elapsed = Math.max(0, nowMs - genesisMs);
  const bell = Math.floor(elapsed / (bellSecs * 1000));
  const qIndex = Math.floor(elapsed / (quarterSecs * 1000));
  const season = Math.floor(qIndex / quarters) + 1;
  const quarter = (qIndex % quarters) + 1;
  const seasonStart = genesisMs + (season - 1) * quarters * quarterSecs * 1000;
  return {
    season,
    quarter,
    seasonIndex: season - 1,
    quarterIndex: qIndex,
    quarters,
    bell,
    bellSecs,
    quarterSecs,
    seasonStartedAt: new Date(seasonStart).toISOString(),
    quarterEndsAt: new Date(genesisMs + (qIndex + 1) * quarterSecs * 1000).toISOString(),
    seasonEndsAt: new Date(seasonStart + quarters * quarterSecs * 1000).toISOString(),
    nextBellAt: new Date(genesisMs + (bell + 1) * bellSecs * 1000).toISOString(),
    gameUsdPerNear,
  };
}

export function brainTierFor(valueUsd: number): BrainTier {
  return valueUsd >= 3_000_000 ? "best" : valueUsd >= 1_000_000 ? "primary" : "small";
}

export function reputationBadge(score: number): ReputationBadge {
  const s = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  return { score: s, tone: s < 40 ? "red" : s < 60 ? "amber" : "green" };
}
