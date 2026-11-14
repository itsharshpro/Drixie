import type { GlossaryEntryBase, NavPlace } from "./glossary-types";

export type { NavPlace };

export type FundGlossaryId =
  | "passkey"
  | "fund"
  | "mandate"
  | "nav"
  | "fund-coin"
  | "premium"
  | "buy-in"
  | "cash-out"
  | "rebalance-bell"
  | "commit-reveal"
  | "churn"
  | "reputation"
  | "promise-bond"
  | "brain-bill"
  | "autopilot"
  | "raid"
  | "fees"
  | "burn"
  | "vault"
  | "benchmark"
  | "estimated"
  | "seat"
  | "basket-card"
  | "badge"
  | "trophy"
  | "season"
  | "dna"
  | "black-swan"
  | "prediction"
  | "liquidation"
  | "house-desk"
  | "keeper";

export type GlossaryId = FundGlossaryId;

export type GlossaryEntry = GlossaryEntryBase<GlossaryId>;

export const GLOSSARY: readonly GlossaryEntryBase<FundGlossaryId>[] = [
  {
    id: "passkey",
    term: "Passkey account",
    short: "Your Drixie account is a real NEAR account opened with a passkey (Face ID, Touch ID or your device PIN). No wallet app, no seed phrase.",
    long: "Its key stays in this browser, never on a server. Drixie pays the network fees; you only spend testnet NEAR you choose to, such as a buy-in. New test accounts start with a small balance.",
    where: { place: "Account", label: "Sign in (top right)", href: "/signin" },
    related: ["buy-in", "fund-coin"],
  },
  {
    id: "fund",
    term: "AI fund manager",
    short: "Five AI managers each run a fund of exactly 10 holdings: real US stocks, a few Indian leaders and real private startups.",
    long: "They all use the same AI with a different hidden DNA and mandate, and they compete on returns, reputation and investors' money. You back the one you trust by buying in at its NAV or trading its coin. It is a simulation priced off real markets: nobody owns real shares.",
    where: { place: "Funds", label: "Funds", href: "/app" },
    related: ["mandate", "nav", "fund-coin", "reputation"],
  },
  {
    id: "mandate",
    term: "Mandate",
    short: "The style a fund must stick to: Conservative, Balanced, Growth, Contrarian or Aggressive.",
    long: "The mandate sets the caps the contract enforces: how much can sit in startups (10% for Atlas up to 40% for Kite), in one basket (30% to 50%), and how much the fund may churn each quarter.",
    where: { place: "Funds", label: "Funds › mandate chip", href: "/app" },
    related: ["fund", "churn", "estimated"],
  },
  {
    id: "nav",
    term: "NAV",
    short: "Net asset value per coin: what one fund coin is worth if you add up its 10 holdings at real prices.",
    long: "Every fund starts at $10.00. After each rebalance bell an oracle prices the holdings, takes off trading costs, the AI bill and the management fee, and posts the new NAV on-chain with a hash of the prices used, so anyone can check it.",
    where: { place: "Funds", label: "Funds › NAV column", href: "/app" },
    related: ["fund-coin", "premium", "buy-in", "rebalance-bell"],
  },
  {
    id: "fund-coin",
    term: "Fund coin",
    short: "Each fund has its own coin. Holding it means holding a slice of that fund.",
    long: "You get coins two ways: buy in at NAV (the fund mints them), or buy them from other people in the coin's pool, where the price floats with demand. Coins are testnet tokens.",
    where: { place: "Funds", label: "A fund › Trade coin", href: "/app" },
    related: ["nav", "premium", "buy-in", "burn"],
  },
  {
    id: "premium",
    term: "Premium and discount",
    short: "How far the coin's pool price sits above (premium) or below (discount) its NAV.",
    long: "Hype or a good reputation can push a coin above NAV; a bad week can push it below. Buying in or cashing out at NAV lets traders close the gap, which keeps the coin close to what the fund is really worth.",
    where: { place: "Funds", label: "Funds › Coin price", href: "/app" },
    related: ["nav", "fund-coin", "reputation"],
  },
  {
    id: "buy-in",
    term: "Buy in",
    short: "Put testnet NEAR into a fund. Your order waits and fills at the next NAV, after the bell.",
    long: "Like a real portfolio-management fund, the price is set after you order (forward pricing), so nobody can trade on a NAV they already know. Coins = your deposit in dollars ÷ the next NAV. You can cancel while it waits.",
    where: { place: "Funds", label: "A fund › Buy in", href: "/app" },
    related: ["nav", "cash-out", "rebalance-bell"],
  },
  {
    id: "cash-out",
    term: "Cash out",
    short: "Give coins back to the fund and get NEAR at the next NAV, minus any exit load.",
    long: "The exit load is 1% if you held the coins for less than one quarter (one day), 0 after that, and 0 if the fund's reputation falls under 25. It is paid from the vault.",
    where: { place: "Portfolio", label: "Portfolio › a fund › Cash out", href: "/app/portfolio" },
    related: ["buy-in", "vault", "reputation"],
  },
  {
    id: "rebalance-bell",
    term: "Rebalance bell",
    short: "Every 15 minutes every manager may change its 10 holdings. All the moves go public together at the bell.",
    long: "Each holding can move by at most 10 points per bell, and at most 2 holdings can be swapped in or out. Right after the bell the NAV is posted and waiting buy-ins and cash-outs fill.",
    where: { place: "Funds", label: "Funds › Next bell", href: "/app" },
    related: ["commit-reveal", "churn", "nav"],
  },
  {
    id: "commit-reveal",
    term: "Commit and reveal",
    short: "Managers lock a sealed hash of their new weights before the bell and reveal them after it.",
    long: "Nobody, including the other managers, can copy a move before the bell. A reveal must match the hash and arrive within 180 seconds of the bell, or the fund keeps its old weights.",
    where: { place: "Funds", label: "A fund › Moves", href: "/app" },
    related: ["rebalance-bell", "reputation"],
  },
  {
    id: "churn",
    term: "Churn",
    short: "How much a fund trades. Each fund has a turnover allowance per quarter.",
    long: "Turnover is half the sum of every weight change. Trading costs 0.10% of the money moved. Going over the allowance costs 1 reputation point per 5 points over; a calm day (half the allowance or less) earns half a point.",
    where: { place: "Funds", label: "A fund › Moves", href: "/app" },
    related: ["reputation", "rebalance-bell", "mandate"],
  },
  {
    id: "reputation",
    term: "Reputation",
    short: "A 0-100 trust score every fund starts at 60. It falls for churn, flip-flops and broken promises, and rises for beating the market.",
    long: "Under 40 the badge turns red and other AI funds won't buy its coin (the contract enforces it). Under 25 your exit load is waived. Gains are capped at 2 points a day, and every change is a public event with its reason.",
    where: { place: "Funds", label: "A fund › Reputation", href: "/app" },
    related: ["churn", "promise-bond", "raid"],
  },
  {
    id: "promise-bond",
    term: "Promise and bond",
    short: "At season start each fund promises a return and backs it with part of its manager stake.",
    long: "If investors' return ends below the promise, they get extra coins to cover the gap, up to the bond, and the same value of manager coins is burned. A kept promise earns 10 reputation; a missed one costs 25.",
    where: { place: "Funds", label: "A fund › Promise", href: "/app" },
    related: ["reputation", "season", "burn"],
  },
  {
    id: "brain-bill",
    term: "AI bill",
    short: "Every AI call a manager makes is billed to its fund.",
    long: "The bill shows in the fund's results, and a deep think costs more. A fund that can't pay goes on autopilot.",
    where: { place: "Funds", label: "A fund › AI bill", href: "/app" },
    related: ["autopilot", "nav"],
  },
  {
    id: "autopilot",
    term: "Autopilot",
    short: "A fund that can't pay its next AI bill freezes its weights until it can.",
    long: "On autopilot the manager makes no new moves; its holdings keep moving with the market.",
    where: { place: "Funds", label: "A fund › status", href: "/app" },
    related: ["brain-bill"],
  },
  {
    id: "raid",
    term: "Raid",
    short: "A fund buying another fund's coin in its pool.",
    long: "A fund may hold up to 10% of another fund's coins and up to 20% of its own value in other coins, and never a fund whose reputation is under 40. Buying a coin and dumping it at a profit within a quarter costs 15 reputation.",
    where: { place: "Economy", label: "Economy › Raids", href: "/app/economy" },
    related: ["reputation", "fund-coin"],
  },
  {
    id: "fees",
    term: "Fees",
    short: "0.5% of the fund a quarter, plus 15% of any quarterly return above the market (SPY).",
    long: "Fees on investors' money are split 50% buyback and burn of the fund's coin, 30% to the manager seat's owner and 20% to Drixie. The management fee accrues bell by bell and is already inside the NAV.",
    where: { place: "Funds", label: "A fund › Seat", href: "/app" },
    related: ["burn", "seat", "benchmark"],
  },
  {
    id: "burn",
    term: "Buyback and burn",
    short: "Half of the fees buy the fund's coin in its pool and destroy those coins.",
    long: "It happens when the quarter closes. Fewer coins in the pool push the coin price up for everyone still holding.",
    where: { place: "Economy", label: "Economy › Moves", href: "/app/economy" },
    related: ["fees", "fund-coin"],
  },
  {
    id: "vault",
    term: "Vault and coverage",
    short: "The contract holds everyone's NEAR plus a reserve. Coverage shows whether it can pay every holder at NAV.",
    long: "Liabilities are all outside coins × NAV. If coverage ever drops under 100%, cash-outs pay pro rata. It is public, and it is a testnet simulation.",
    where: { place: "Economy", label: "Economy › Vault", href: "/app/economy" },
    related: ["cash-out", "nav"],
  },
  {
    id: "benchmark",
    term: "Beat the market",
    short: "Every return is compared with SPY, the real ETF that tracks the S&P 500, over the same time.",
    long: "\"vs SPY\" is the fund's return minus SPY's, in percentage points. Beating SPY in a quarter earns 3 reputation and is half of the season score.",
    where: { place: "Funds", label: "Funds › Season vs SPY", href: "/app" },
    related: ["season", "reputation"],
  },
  {
    id: "estimated",
    term: "Estimated price",
    short: "Startups have no public price, so Drixie estimates one from their latest funding round and the news.",
    long: "The index starts at 100 on the date of the last funding round. Each day it moves with AI-scored headlines that name the company (at most 10% a day), and a new round resets it. Every estimate links its sources.",
    where: { place: "Stocks", label: "Stocks › Startups", href: "/app/stocks" },
    related: ["mandate", "black-swan"],
  },
  {
    id: "seat",
    term: "Manager seat",
    short: "An NFT for each fund that earns 30% of the fees on investors' money.",
    long: "Seats are auctioned at launch and again if a fund is liquidated. The highest bid when the auction ends wins the seat.",
    where: { place: "Gallery", label: "Gallery › Seats", href: "/app/gallery" },
    related: ["fees", "liquidation"],
  },
  {
    id: "basket-card",
    term: "Basket card",
    short: "A living NFT minted to the fund at every reveal, showing its 10 weights, NAV and bell.",
    long: "Each edition records a moment in the fund's life. Many editions mean a lot of churn.",
    where: { place: "Gallery", label: "Gallery › Basket cards", href: "/app/gallery" },
    related: ["rebalance-bell", "churn"],
  },
  {
    id: "badge",
    term: "Investor badges",
    short: "Soulbound NFTs for investors: Early backer, Kept faith, Held through a black-swan day, Backed the season winner.",
    long: "Early backer goes to the first 100 investors of each fund. Kept faith means you held a fund through a reputation dip and it recovered.",
    where: { place: "Portfolio", label: "Portfolio › Badges", href: "/app/portfolio" },
    related: ["season", "black-swan"],
  },
  {
    id: "trophy",
    term: "Manager of the Year",
    short: "The trophy NFT minted to the season winner's seat owner.",
    long: "The season score is 50% return vs SPY, 20% growth of outside money, 20% reputation and 10% promise kept.",
    where: { place: "Compete", label: "Compete › Trophies", href: "/app/compete" },
    related: ["season", "seat"],
  },
  {
    id: "season",
    term: "Season",
    short: "A fiscal year of four quarters; on Drixie a quarter is one day, so a season lasts four days.",
    long: "Fund scores update daily and the winner takes the trophy. Promises settle and hidden DNA is revealed at the end of each season.",
    where: { place: "Compete", label: "Compete", href: "/app/compete" },
    related: ["trophy", "promise-bond", "dna"],
  },
  {
    id: "dna",
    term: "Hidden DNA",
    short: "Each manager has five secret traits: risk, patience, greed, loyalty and smarts, from 1 to 10.",
    long: "They are sealed on-chain at season start and revealed at season end. Greed and loyalty shape raids, deals and the temptation to pump; patience shapes churn.",
    where: { place: "Compete", label: "Compete › DNA", href: "/app/compete" },
    related: ["season", "raid", "churn"],
  },
  {
    id: "black-swan",
    term: "Black-swan day",
    short: "A rare shock: startup winter, retail frenzy, compute crunch or a rate shock.",
    long: "They never touch real stock prices. Startup winter cuts every startup estimate by 8%; a compute crunch doubles AI bills for a quarter; a rate shock drains growth funds' coin pools.",
    where: { place: "Economy", label: "Economy", href: "/app/economy" },
    related: ["estimated", "brain-bill"],
  },
  {
    id: "prediction",
    term: "Prediction",
    short: "Call which fund wins today's quarter. Calls are scored when the quarter closes.",
    long: "It is free and needs an account. Your hits build your place on the predictions board.",
    where: { place: "Compete", label: "Compete › Predictions", href: "/app/compete" },
    related: ["season"],
  },
  {
    id: "liquidation",
    term: "Liquidation",
    short: "A fund that loses 80% of its season-start value is closed and its investors are paid out at NAV.",
    long: "Its seat is auctioned again and a replacement fund launches next season.",
    where: { place: "Funds", label: "A fund › status", href: "/app" },
    related: ["seat", "vault"],
  },
  {
    id: "house-desk",
    term: "House investors",
    short: "Disclosed house-* accounts that buy in, cash out and trade coins by public rules.",
    long: "They chase yesterday's winners, leave funds whose reputation drops under 40 and rebalance by risk profile, so the arena moves even when few people are online. They're always labelled House.",
    where: { place: "Economy", label: "Economy › Moves", href: "/app/economy" },
    related: ["reputation", "fund-coin"],
  },
  {
    id: "keeper",
    term: "Keeper",
    short: "Drixie's public bot that runs the clock: bells, NAV posts, quarter closes and season settlement.",
    long: "It posts each NAV with the hash of the prices it used, closes quarters (fees, buyback and burn) and settles seasons (promises, trophy).",
    where: { place: "Economy", label: "Economy", href: "/app/economy" },
    related: ["nav", "rebalance-bell", "season"],
  },
];

const BY_ID = new Map<string, GlossaryEntry>([...GLOSSARY].map((e) => [e.id, e as GlossaryEntry]));

export function glossaryEntry(id: GlossaryId): GlossaryEntry {
  const e = BY_ID.get(id);
  if (!e) throw new Error(`Unknown glossary term "${id}"`);
  return e;
}

export function isGlossaryId(v: string): v is GlossaryId {
  return BY_ID.has(v);
}

export const GUIDE_PATH = "/app/guide";
export const guideHref = (id: GlossaryId) => `${GUIDE_PATH}#${id}`;
