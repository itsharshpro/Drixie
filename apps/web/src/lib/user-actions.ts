import type { NavPlace } from "./glossary";
import type { ActionPlace, UserActionBase } from "./user-actions-types";

export type { ActionPlace };

export type FundUserActionId =
  | "create-account"
  | "risk-check"
  | "compare-funds"
  | "buy-in"
  | "trade-coin"
  | "read-moves"
  | "browse-stocks"
  | "cash-out"
  | "cancel-order"
  | "predict"
  | "climb-leaderboard"
  | "watch-economy"
  | "bid-seat"
  | "collect-cards";

export type UserActionId = FundUserActionId;
export type UserAction = UserActionBase<UserActionId>;

export const PLACE_ORDER: readonly ActionPlace[] = ["Account", "Funds", "Stocks", "Portfolio", "Compete", "Economy", "Gallery"];

export const PLACE_JOB: Record<ActionPlace, string> = {
  Account: "One passkey, no wallet app.",
  Funds: "Compare the five AI fund managers and back one.",
  Stocks: "Every stock and startup the funds can hold, with real prices.",
  Portfolio: "Your fund coins, value, profit, orders and badges.",
  Compete: "The season clock, leaderboards, predictions and trophies.",
  Economy: "News, every move, raids, reputation events and the vault.",
  Gallery: "Basket cards, manager seats and auctions, badges and trophies.",
};

export const USER_ACTIONS: readonly UserActionBase<FundUserActionId>[] = [
  {
    id: "create-account",
    title: "Create your account",
    why: "One passkey opens a real NEAR account in your name. No wallet app, no seed phrase, no network fees.",
    place: "Account",
    where: "Sign in (top right) › Continue with passkey",
    href: "/signin",
    go: "Create account",
    needs: { account: false, near: false },
    time: "About 30 seconds",
    terms: ["passkey"],
  },
  {
    id: "risk-check",
    title: "Take the risk check",
    why: "Three questions match you to the funds whose style fits how you feel about swings.",
    place: "Funds",
    where: "Funds › Start here › Start the check",
    href: "/app/start",
    go: "Start the check",
    needs: { account: false, near: false },
    time: "About 30 seconds",
    terms: ["mandate"],
  },
  {
    id: "compare-funds",
    title: "Compare the five managers",
    why: "See each fund's NAV, its return against the market, its reputation and how it trades, side by side.",
    place: "Funds",
    where: "Funds › the table",
    href: "/app",
    go: "Open Funds",
    needs: { account: false, near: false },
    time: "A minute",
    terms: ["nav", "benchmark", "reputation"],
  },
  {
    id: "buy-in",
    title: "Buy into a fund",
    why: "Your testnet NEAR buys coins at the next NAV, right after the rebalance bell.",
    place: "Funds",
    where: "Funds › a fund › Buy in",
    href: "/app/f/{fund}?sheet=buy",
    go: "Buy in",
    needs: { account: true, near: true },
    time: "About 20 seconds, fills at the next bell",
    terms: ["buy-in", "nav", "rebalance-bell"],
  },
  {
    id: "trade-coin",
    title: "Trade a fund's coin",
    why: "Buy or sell right now in the coin's pool. The price floats above or below NAV with demand.",
    place: "Funds",
    where: "Funds › a fund › Trade coin",
    href: "/app/f/{fund}?sheet=trade",
    go: "Trade coin",
    needs: { account: true, near: true },
    time: "About 20 seconds",
    terms: ["fund-coin", "premium"],
  },
  {
    id: "read-moves",
    title: "Read a manager's moves",
    why: "Every rebalance, weight by weight, with the manager's own note on why.",
    place: "Funds",
    where: "Funds › a fund › Moves",
    href: "/app/f/{fund}#moves",
    go: "See moves",
    needs: { account: false, near: false },
    time: "A minute",
    terms: ["rebalance-bell", "commit-reveal", "churn"],
  },
  {
    id: "browse-stocks",
    title: "Browse the stocks",
    why: "Every asset in 9 baskets, including 24/7 crypto, with live prices and which funds hold each one.",
    place: "Stocks",
    where: "Stocks",
    href: "/app/stocks",
    go: "Open Stocks",
    needs: { account: false, near: false },
    time: "A minute",
    terms: ["estimated", "benchmark"],
  },
  {
    id: "cash-out",
    title: "Cash out",
    why: "Give coins back at the next NAV and get NEAR from the vault, minus any exit load.",
    place: "Portfolio",
    where: "Portfolio › a fund › Cash out",
    href: "/app/portfolio",
    go: "Open Portfolio",
    needs: { account: true, near: false, shares: true },
    time: "About 20 seconds, pays at the next bell",
    terms: ["cash-out", "vault"],
  },
  {
    id: "cancel-order",
    title: "Cancel a waiting order",
    why: "Changed your mind before the bell? Cancel a buy-in or cash-out that hasn't filled yet.",
    place: "Portfolio",
    where: "Portfolio › Orders waiting",
    href: "/app/portfolio#orders",
    go: "See orders",
    needs: { account: true, near: false },
    time: "About 10 seconds",
    terms: ["buy-in"],
  },
  {
    id: "predict",
    title: "Predict today's winner",
    why: "Call which fund wins the quarter. Calls are scored when the day closes.",
    place: "Compete",
    where: "Compete › Predictions",
    href: "/app/compete#predictions",
    go: "Make a call",
    needs: { account: true, near: false },
    time: "About 10 seconds",
    terms: ["prediction", "season"],
  },
  {
    id: "climb-leaderboard",
    title: "Climb the investor board",
    why: "Investors rank by percent return this season. Back the right manager and rise.",
    place: "Compete",
    where: "Compete › Investors",
    href: "/app/compete#investors",
    go: "See the board",
    needs: { account: true, near: true },
    time: "All season",
    terms: ["season", "badge"],
  },
  {
    id: "watch-economy",
    title: "Follow the economy",
    why: "News the managers read, every move, raids between funds, reputation events and the vault's coverage.",
    place: "Economy",
    where: "Economy",
    href: "/app/economy",
    go: "Open Economy",
    needs: { account: false, near: false },
    time: "A minute",
    terms: ["raid", "vault", "reputation"],
  },
  {
    id: "bid-seat",
    title: "Bid for a manager seat",
    why: "A seat earns 30% of the fees on investors' money in its fund. Seats are auctioned at launch and after a liquidation.",
    place: "Gallery",
    where: "Gallery › Seats › Bid",
    href: "/app/gallery#seats",
    go: "See seats",
    needs: { account: true, near: true },
    time: "About 20 seconds",
    terms: ["seat", "fees"],
  },
  {
    id: "collect-cards",
    title: "Browse basket cards",
    why: "Every reveal mints a living card with the fund's 10 weights, NAV and bell. Many cards mean a lot of churn.",
    place: "Gallery",
    where: "Gallery › Basket cards",
    href: "/app/gallery",
    go: "Open Gallery",
    needs: { account: false, near: false },
    time: "A minute",
    terms: ["basket-card", "churn"],
  },
];

const BY_ID = new Map<string, UserAction>([...USER_ACTIONS].map((a) => [a.id, a as UserAction]));

export function userAction(id: UserActionId): UserAction {
  const a = BY_ID.get(id);
  if (!a) throw new Error(`Unknown user action "${id}"`);
  return a;
}

export function actionHref(action: Pick<UserAction, "href">, fund?: string | null): string {
  if (!action.href.includes("{fund}") && !action.href.includes("{ticker}")) return action.href;
  return fund ? action.href.replace(/\{fund\}|\{ticker\}/, encodeURIComponent(fund.toLowerCase())) : "/app";
}

export function actionsByPlace(actions: readonly UserAction[] = USER_ACTIONS): { place: ActionPlace; actions: UserAction[] }[] {
  return PLACE_ORDER.map((place) => ({ place, actions: actions.filter((a) => a.place === place) })).filter((g) => g.actions.length > 0);
}

export function needsLabel(needs: UserAction["needs"]): string {
  if (!needs.account) return "No account needed";
  const parts = ["an account"];
  if (needs.near) parts.push("NEAR");
  if (needs.shares) parts.push("coins");
  return `Needs ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`}`;
}

export const START_STEPS = [
  {
    id: "risk",
    title: "Take the risk check",
    body: "Three questions. We match you to the funds whose style fits you.",
    action: "risk-check" as UserActionId,
  },
  {
    id: "pick",
    title: "Pick a fund",
    body: "Compare the five managers: NAV, return vs the market, reputation.",
    action: "compare-funds" as UserActionId,
  },
  {
    id: "buy",
    title: "Buy in",
    body: "Your money buys coins at the next NAV, right after the rebalance bell.",
    action: "buy-in" as UserActionId,
  },
] as const;

export const NAV_PLACES: readonly NavPlace[] = ["Funds", "Stocks", "Portfolio", "Compete", "Economy", "Gallery"];
