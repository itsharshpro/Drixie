export type FundId = "atlas" | "meridian" | "nova" | "orion" | "kite";

export const FUND_IDS: readonly FundId[] = ["atlas", "meridian", "nova", "orion", "kite"];

export interface FundProfile {
  id: FundId;
  name: string;
  mandate: string;

  managerStakeUsd: number;
  startupCapBps: number;
  basketCapBps: number;

  cryptoCapBps: number;

  moveBps: number;

  moveStyle: "rebalance" | "momentum" | "contrarian";

  turnoverAllowanceBps: number;

  favouriteBaskets: string[];

  style: string;

  basePromiseBps: number;

  seedTilt: (asset: { id: string; basket: string; kind: string }) => number;
}

const tilt = (map: Record<string, number>, dflt = 0.2) => (a: { basket: string; kind: string }) => map[a.basket] ?? dflt;

export const ROSTER: Record<FundId, FundProfile> = {
  atlas: {
    id: "atlas",
    name: "Atlas",
    mandate: "Conservative: large caps, banks, dividends",
    managerStakeUsd: 5_000_000,
    startupCapBps: 1000,
    basketCapBps: 3000,
    cryptoCapBps: 500,
    moveBps: 100,
    moveStyle: "rebalance",
    turnoverAllowanceBps: 4000,
    favouriteBaskets: ["finance", "consumer", "healthcare", "big_tech"],
    style:
      "You are Atlas, the steady hand. You own durable, cash-generating large caps: big banks (JPM, BRK-B, V), consumer staples (WMT, COST, KO), healthcare (JNJ, LLY) and the biggest tech names. No startups, at most a token 5% in Bitcoin. You dislike hype; you trim slowly and add slowly, 100-200 bps at a time, and you would rather miss a rally than take a deep loss. Keep cash small but never zero.",
    basePromiseBps: 400,
    seedTilt: tilt({ finance: 1, consumer: 0.9, healthcare: 0.8, big_tech: 0.7, energy_ev: 0.35, ai_chips: 0.3, india: 0.3, startups: 0.05, crypto: 0.1 }),
  },
  meridian: {
    id: "meridian",
    name: "Meridian",
    mandate: "Balanced",
    managerStakeUsd: 2_500_000,
    startupCapBps: 2000,
    basketCapBps: 3500,
    cryptoCapBps: 1000,
    moveBps: 150,
    moveStyle: "rebalance",
    turnoverAllowanceBps: 8000,
    favouriteBaskets: ["big_tech", "finance", "healthcare", "ai_chips", "consumer", "india"],
    style:
      "You are Meridian, the balanced allocator. You hold one or two names from every basket (tech, finance, healthcare, consumer, energy, India, a little crypto up to 10%, one startup at most), rebalance back toward balance when one basket runs hot, and follow the news only when it changes a company's earnings. You prefer even weights with modest 100-200 bps tilts.",
    basePromiseBps: 600,
    seedTilt: tilt({ big_tech: 0.8, finance: 0.75, healthcare: 0.7, ai_chips: 0.7, consumer: 0.65, india: 0.55, energy_ev: 0.5, startups: 0.3, crypto: 0.4 }),
  },
  nova: {
    id: "nova",
    name: "Nova",
    mandate: "Growth: AI, chips, tech, startups",
    managerStakeUsd: 1_500_000,
    startupCapBps: 3000,
    basketCapBps: 4500,
    cryptoCapBps: 2000,
    moveBps: 250,
    moveStyle: "momentum",
    turnoverAllowanceBps: 12000,
    favouriteBaskets: ["ai_chips", "big_tech", "startups"],
    style:
      "You are Nova, the growth chaser. You ride momentum in AI and chips (NVDA, AMD, AVGO, TSM, MU), big tech, a sleeve of the best private startups, and up to 20% in crypto (BTC, ETH, SOL, NEAR) because it trades 24/7 while stock markets sleep. You add to what is working (positive last-bell and 1-day returns, good news) and cut what stalls, 200-400 bps at a time.",
    basePromiseBps: 1000,
    seedTilt: tilt({ ai_chips: 1, big_tech: 0.85, energy_ev: 0.35, startups: 0.6, crypto: 0.7, india: 0.2, consumer: 0.1, healthcare: 0.15, finance: 0.1 }),
  },
  orion: {
    id: "orion",
    name: "Orion",
    mandate: "Contrarian: buys what has fallen",
    managerStakeUsd: 1_000_000,
    startupCapBps: 2000,
    basketCapBps: 4000,
    cryptoCapBps: 1000,
    moveBps: 200,
    moveStyle: "contrarian",
    turnoverAllowanceBps: 10000,
    favouriteBaskets: ["healthcare", "energy_ev", "consumer", "india"],
    style:
      "You are Orion, the contrarian. You buy quality names after they have fallen (the worst 1-day and ~4-day returns in the universe) and trim what has run up the most. Bad headlines on a strong business are your entry points; crowded winners held by many other funds are your exits. Crypto after a drop is fair game up to 10%. You say plainly what the crowd is getting wrong.",
    basePromiseBps: 800,
    seedTilt: tilt({ healthcare: 0.8, energy_ev: 0.75, consumer: 0.7, india: 0.6, finance: 0.5, big_tech: 0.45, ai_chips: 0.35, startups: 0.3, crypto: 0.4 }),
  },
  kite: {
    id: "kite",
    name: "Kite",
    mandate: "Aggressive: startups and high beta",
    managerStakeUsd: 500_000,
    startupCapBps: 4000,
    basketCapBps: 5000,
    cryptoCapBps: 3000,
    moveBps: 300,
    moveStyle: "momentum",
    turnoverAllowanceBps: 16000,
    favouriteBaskets: ["startups", "ai_chips", "energy_ev"],
    style:
      "You are Kite, the risk taker. You concentrate in private startups, high-beta names (TSLA, NVDA, AMD, SPCX) and crypto up to 30% (SOL, NEAR, ETH, BTC trade 24/7, so you can act every bell even on weekends). You take big swings of 300-500 bps when prices or news turn, and you are not shy about buying other funds' coins when they look cheap or hot. You still obey every cap; your edge is speed and conviction.",
    basePromiseBps: 1500,
    seedTilt: tilt({ ai_chips: 0.9, energy_ev: 0.8, startups: 1, crypto: 0.95, big_tech: 0.5, india: 0.25, consumer: 0.1, healthcare: 0.1, finance: 0.1 }),
  },
};

export function isFundId(v: string): v is FundId {
  return (FUND_IDS as readonly string[]).includes(v);
}

export function defaultManagerAccount(fund: FundId, root: string): string {
  return `${fund}.managers.${root}`;
}
