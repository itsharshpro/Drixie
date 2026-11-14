import type { FeedItem } from "@listed/shared";
import { isHouseAccount } from "@listed/shared";

export type FundActor = "manager" | "keeper" | "house" | "people";

export const FUND_ACTORS: Record<FundActor, { label: string; short: string; icon: string }> = {
  manager: {
    label: "AI managers",
    short: "Five AI fund managers. Each one can only rebalance its own 10 holdings, inside the caps the contract enforces.",
    icon: "Bot",
  },
  keeper: {
    label: "Keeper",
    short: "Drixie's public bot for the clock: it posts each NAV with a hash of the prices, closes quarters and settles seasons.",
    icon: "Timer",
  },
  house: {
    label: "House investors",
    short: "Disclosed house-* accounts that buy in, cash out and trade coins by fixed public rules. Always labelled.",
    icon: "Building2",
  },
  people: {
    label: "People",
    short: "Investors like you: buying in, cashing out, trading coins, predicting and bidding on seats.",
    icon: "Users",
  },
};

export const FUND_ACTOR_ORDER: readonly FundActor[] = ["manager", "keeper", "house", "people"];

export type FundAgentActionId =

  | "rebalance"
  | "raid"
  | "promise"

  | "nav_post"
  | "fee_burn"
  | "season_close"
  | "nft_mint"

  | "flow"
  | "coin_trade"
  | "reputation"
  | "news";

export interface FundAgentActionMeta {
  label: string;
  actor: FundActor | "any";
  sentence: string;
  icon: string;
}

export const FUND_AGENT_ACTIONS: Record<FundAgentActionId, FundAgentActionMeta> = {
  rebalance: { label: "Rebalanced", actor: "manager", sentence: "Changed its weights at the bell, with a public note on why.", icon: "Shuffle" },
  raid: { label: "Raided a coin", actor: "manager", sentence: "Bought or sold another fund's coin in its pool.", icon: "Swords" },
  promise: { label: "Made a promise", actor: "manager", sentence: "Set its season return target and the bond behind it.", icon: "Handshake" },
  nav_post: { label: "Posted NAV", actor: "keeper", sentence: "Priced every fund from real markets and posted the NAVs on-chain.", icon: "Calculator" },
  fee_burn: { label: "Bought back & burned", actor: "keeper", sentence: "Collected fees and burned coins bought back from the pool.", icon: "Flame" },
  season_close: { label: "Closed the season", actor: "keeper", sentence: "Settled promises and minted the trophy.", icon: "Trophy" },
  nft_mint: { label: "Minted an NFT", actor: "keeper", sentence: "Minted a basket card, badge, seat or trophy.", icon: "Images" },
  flow: { label: "Money in or out", actor: "any", sentence: "Someone bought in or cashed out at NAV.", icon: "ArrowLeftRight" },
  coin_trade: { label: "Traded a coin", actor: "any", sentence: "Someone bought or sold a fund coin in its pool.", icon: "Coins" },
  reputation: { label: "Reputation changed", actor: "keeper", sentence: "A fund's trust score moved, with the reason.", icon: "ShieldCheck" },
  news: { label: "News", actor: "keeper", sentence: "A headline naming a stock the funds can hold.", icon: "Newspaper" },
};

export interface ManagerCapability {
  id: "rebalance" | "note" | "raid" | "promise" | "think";
  title: string;
  sentence: string;
  icon: string;
  method: string | null;
}

export const MANAGER_CAPABILITIES: readonly ManagerCapability[] = [
  {
    id: "rebalance",
    title: "Rebalance 10 holdings",
    sentence: "Seal new weights before the bell, reveal them after. At most 10 points per holding and 2 swaps per bell.",
    icon: "Shuffle",
    method: "commit_rebalance · reveal_rebalance",
  },
  { id: "note", title: "Explain the move", sentence: "Every reveal carries a public note of up to 280 characters.", icon: "MessageSquareText", method: null },
  {
    id: "raid",
    title: "Buy other funds' coins",
    sentence: "Up to 10% of a target's coins, 20% of its own value, never a fund with reputation under 40.",
    icon: "Swords",
    method: "cross_trade",
  },
  {
    id: "promise",
    title: "Promise a return",
    sentence: "At season start, a return target backed by up to 30% of its manager stake.",
    icon: "Handshake",
    method: "set_promise",
  },
  {
    id: "think",
    title: "Think harder (for a price)",
    sentence: "A deep think costs more, billed to the fund.",
    icon: "Bot",
    method: null,
  },
];

const FEED_ACTION: Record<FeedItem["kind"], FundAgentActionId> = {
  move: "rebalance",
  flow: "flow",
  trade: "coin_trade",
  raid: "raid",
  reputation: "reputation",
  news: "news",
  nav: "nav_post",
  fee: "fee_burn",
  promise: "promise",
  season: "season_close",
  nft: "nft_mint",
};

export function classifyFeed(item: Pick<FeedItem, "kind" | "account" | "fund">): { action: FundAgentActionId; actor: FundActor } {
  const action = FEED_ACTION[item.kind] ?? "news";
  const meta = FUND_AGENT_ACTIONS[action];
  if (isHouseAccount(item.account)) return { action, actor: "house" };
  if (meta.actor !== "any") return { action, actor: meta.actor };
  return { action, actor: "people" };
}
