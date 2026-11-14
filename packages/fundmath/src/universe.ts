import type { AssetKind, AssetRegion, BasketId } from "@listed/shared";

export interface UniverseAsset {
  id: string;
  name: string;
  basket: BasketId;
  kind: AssetKind;
  region: AssetRegion;

  yahoo: string | null;

  currency: "USD" | "INR";
}

const us = (id: string, name: string, basket: BasketId): UniverseAsset => ({ id, name, basket, kind: "stock", region: "us", yahoo: id, currency: "USD" });
const india = (id: string, name: string): UniverseAsset => ({ id, name, basket: "india", kind: "stock", region: "india", yahoo: id, currency: "INR" });
const startup = (id: string, name: string): UniverseAsset => ({ id, name, basket: "startups", kind: "startup", region: "private", yahoo: null, currency: "USD" });
const crypto = (id: string, name: string): UniverseAsset => ({ id, name, basket: "crypto", kind: "crypto", region: "global", yahoo: `${id}-USD`, currency: "USD" });

export const UNIVERSE: readonly UniverseAsset[] = [
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
  us("XOM", "ExxonMobil", "energy_ev"),
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
  { id: "SPCX", name: "SpaceX", basket: "startups", kind: "stock", region: "us", yahoo: "SPCX", currency: "USD" },
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

export const BENCHMARK: UniverseAsset = { id: "SPY", name: "S&P 500 ETF", basket: "big_tech", kind: "stock", region: "us", yahoo: "SPY", currency: "USD" };

export const FX_INR_SYMBOL = "INR=X";

export const INDIA_CAP_BPS = 3000;

const BY_ID = new Map(UNIVERSE.map((a) => [a.id, a]));

export function assetById(id: string): UniverseAsset | undefined {
  return BY_ID.get(id);
}

export const isStartupBasket = (id: string): boolean => BY_ID.get(id)?.basket === "startups";

export const isCrypto = (id: string): boolean => {
  const a = BY_ID.get(id);
  return a?.kind === "crypto" || a?.basket === "crypto";
};

export const CRYPTO_IDS: readonly string[] = UNIVERSE.filter((a) => a.kind === "crypto").map((a) => a.id);

export const STARTUP_IDS: readonly string[] = UNIVERSE.filter((a) => a.kind === "startup").map((a) => a.id);
const BY_YAHOO = new Map(UNIVERSE.filter((a) => a.yahoo).map((a) => [a.yahoo as string, a]));

export function assetByYahoo(symbol: string): UniverseAsset | undefined {
  return symbol === BENCHMARK.id ? BENCHMARK : BY_YAHOO.get(symbol);
}

export const LISTED_SYMBOLS: readonly string[] = [...UNIVERSE.filter((a) => a.yahoo).map((a) => a.yahoo as string), BENCHMARK.id];

export function universeForContract(): { id: string; basket: BasketId; kind: AssetKind; region: AssetRegion }[] {
  return UNIVERSE.map(({ id, basket, kind, region }) => ({ id, basket, kind, region }));
}
