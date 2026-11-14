export const RELAY_FUNDS_METHODS = [
  "subscribe",
  "redeem",
  "cancel_order",
  "swap_near_for_coin",
  "swap_coin_for_near",
  "mt_transfer",
  "bid_seat",
  "settle_seat_auction",
  "nft_transfer",

  "process_orders",
] as const;
export type RelayFundsMethod = (typeof RELAY_FUNDS_METHODS)[number];

export const PAYABLE_FUNDS_METHODS: readonly string[] = ["subscribe", "swap_near_for_coin", "bid_seat"];

export const FUND_MANAGER_METHODS = [
  "commit_rebalance",
  "reveal_rebalance",
  "cross_trade",
  "set_promise",
  "offer_deal",
  "accept_deal",
  "execute_deal",
  "cancel_deal",
] as const;

export const FUND_OPERATOR_METHODS = [
  "post_nav",
  "anchor_reputation",
  "close_quarter",
  "settle_season",
  "distribute_promises",
  "seal_dna",
  "reveal_dna",
  "mint_badge",
  "settle_seat_auction",
  "process_orders",
  "retire_fund",
] as const;
