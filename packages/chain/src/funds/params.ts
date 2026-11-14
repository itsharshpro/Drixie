import { FUND_SEEDS, FUND_IDS, GAME_USD_PER_NEAR_DEFAULT, type AssetKind, type AssetRegion, type BasketId, type SeedFundId } from "@listed/shared";

export interface UniverseAsset {

  id: string;
  name: string;
  basket: BasketId;
  kind: AssetKind;
  region: AssetRegion;
}

const us = (id: string, name: string, basket: BasketId): UniverseAsset => ({ id, name, basket, kind: "stock", region: "us" });
const india = (id: string, name: string): UniverseAsset => ({ id, name, basket: "india", kind: "stock", region: "india" });
const startup = (id: string, name: string): UniverseAsset => ({ id, name, basket: "startups", kind: "startup", region: "private" });
const crypto = (id: string, name: string): UniverseAsset => ({ id, name, basket: "crypto", kind: "crypto", region: "global" });

export const FUNDS_UNIVERSE: readonly UniverseAsset[] = [
  us("NVDA", "NVIDIA", "ai_chips"),
  us("AMD", "AMD", "ai_chips"),
  us("AVGO", "Broadcom", "ai_chips"),
  us("TSM", "TSMC", "ai_chips"),
  us("ASML", "ASML", "ai_chips"),
  us("MU", "Micron", "ai_chips"),
  us("AAPL", "Apple", "big_tech"),
  us("MSFT", "Microsoft", "big_tech"),
  us("GOOGL", "Alphabet", "big_tech"),
  us("AMZN", "Amazon", "big_tech"),
  us("META", "Meta", "big_tech"),
  us("JPM", "JPMorgan Chase", "finance"),
  us("GS", "Goldman Sachs", "finance"),
  us("V", "Visa", "finance"),
  us("MA", "Mastercard", "finance"),
  us("BRK-B", "Berkshire Hathaway", "finance"),
  us("TSLA", "Tesla", "energy_ev"),
  us("XOM", "Exxon Mobil", "energy_ev"),
  us("CVX", "Chevron", "energy_ev"),
  us("NEE", "NextEra Energy", "energy_ev"),
  us("COST", "Costco", "consumer"),
  us("WMT", "Walmart", "consumer"),
  us("NKE", "Nike", "consumer"),
  us("MCD", "McDonald's", "consumer"),
  us("KO", "Coca-Cola", "consumer"),
  us("LLY", "Eli Lilly", "healthcare"),
  us("UNH", "UnitedHealth", "healthcare"),
  us("JNJ", "Johnson & Johnson", "healthcare"),
  us("PFE", "Pfizer", "healthcare"),
  india("RELIANCE.NS", "Reliance Industries"),
  india("TCS.NS", "Tata Consultancy Services"),
  india("INFY.NS", "Infosys"),
  india("HDFCBANK.NS", "HDFC Bank"),
  india("ICICIBANK.NS", "ICICI Bank"),
  india("BHARTIARTL.NS", "Bharti Airtel"),
  india("ITC.NS", "ITC"),

  { id: "SPCX", name: "SpaceX", basket: "startups", kind: "stock", region: "us" },
  startup("stripe", "Stripe"),
  startup("databricks", "Databricks"),
  startup("revolut", "Revolut"),
  startup("canva", "Canva"),
  startup("zepto", "Zepto"),
  startup("razorpay", "Razorpay"),
  startup("perplexity", "Perplexity"),

  crypto("BTC", "Bitcoin"),
  crypto("ETH", "Ethereum"),
  crypto("SOL", "Solana"),
  crypto("NEAR", "NEAR Protocol"),
];

export const FUND_RULES = {
  holdings: 10,
  minHoldingBps: 200,
  maxHoldingBps: 2500,
  cashMaxBps: 2000,
  indiaCapBps: 3000,
  maxStepBps: 1000,
  maxSwapsPerBell: 2,
  revealWindowSecs: 180,
  tradingCostBps: 10,
  crossMaxTargetSupplyBps: 1000,
  crossMaxOwnValueBps: 2000,
  crossMinReputation: 40,
} as const;

export interface FundLaunch {
  id: SeedFundId;
  name: string;
  mandate: string;
  seedUsd: number;
  startupCapBps: number;
  basketCapBps: number;
  turnoverAllowancePct: number;
  cryptoCapBps: number;
}

export const FUND_LAUNCHES: readonly FundLaunch[] = FUND_IDS.map((id) => {
  const s = FUND_SEEDS[id];
  return {
    id,
    name: s.name,
    mandate: s.mandate,
    seedUsd: s.seedUsd,
    startupCapBps: s.startupCapBps,
    basketCapBps: s.basketCapBps,
    turnoverAllowancePct: s.turnoverAllowancePct,
    cryptoCapBps: s.cryptoCapBps,
  };
});

export interface SeasonConfig {
  bellSecs: number;
  quarterSecs: number;
  quarters: number;

  revealSecs: number;

  auctionSecs: number;
}

export const DEFAULT_SEASON: SeasonConfig = { bellSecs: 900, quarterSecs: 86_400, quarters: 4, revealSecs: 180, auctionSecs: 86_400 };

export function seasonConfig(o: { bellSecs?: number; quarterSecs?: number; quarters?: number; revealSecs?: number; auctionSecs?: number } = {}): SeasonConfig {
  const bellSecs = o.bellSecs ?? DEFAULT_SEASON.bellSecs;
  const quarterSecs = o.quarterSecs ?? DEFAULT_SEASON.quarterSecs;
  const reveal = o.revealSecs ?? Math.min(DEFAULT_SEASON.revealSecs, Math.floor(bellSecs / 2));
  return {
    bellSecs,
    quarterSecs,
    quarters: o.quarters ?? DEFAULT_SEASON.quarters,
    revealSecs: Math.max(1, Math.min(reveal, bellSecs - 1)),
    auctionSecs: o.auctionSecs ?? quarterSecs,
  };
}
export const DEFAULT_GAME_USD_PER_NEAR = GAME_USD_PER_NEAR_DEFAULT;

export const LAUNCH_NAV_MICRO_USD = 10_000_000n;
export const MICRO_USD_PER_USD = 1_000_000n;

export const managerAccountId = (fund: string, root: string): string => `${fund}.managers.${root}`;
export const managersParentId = (root: string): string => `managers.${root}`;
export const fundsOperatorId = (root: string): string => `operator.${root}`;

export const HOUSE_INVESTORS = [
  { name: "chaser", rule: "Chases yesterday's winner: buys in to the fund with the best 1-day NAV return and cashes out of the worst." },
  { name: "prudent", rule: "Leaves bad managers: holds every fund with reputation 40 or more in equal parts and cashes out of any fund that falls below 40." },
  { name: "planner", rule: "Rebalances by risk profile: keeps a moderate mix (Atlas 30%, Meridian 30%, Nova 20%, Orion 10%, Kite 10%) and rebalances when a fund drifts 5 points." },
  { name: "arb", rule: "Anchors coin prices: buys a fund's coin in its pool when it trades 2% or more below NAV and sells when it trades 2% or more above." },
] as const;
export type HouseInvestorName = (typeof HOUSE_INVESTORS)[number]["name"];
export const houseInvestorId = (name: string, root: string): string => `house-${name}.${root}`;
