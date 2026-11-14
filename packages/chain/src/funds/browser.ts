export type FunctionCallSpec = { methodName: string; args: object; gas?: string; deposit?: string };

const ONE_YOCTO = "1";

const GAS_100 = "100000000000000";
const GAS_150 = "150000000000000";

const big = (v: bigint | string | number): bigint => (typeof v === "bigint" ? v : BigInt(v));

export const fundsCalls = {

  subscribe: (fund: string, depositYocto: bigint | string): FunctionCallSpec => ({
    methodName: "subscribe",
    args: { fund },
    gas: GAS_100,
    deposit: big(depositYocto).toString(),
  }),

  redeem: (fund: string, coins: bigint | string): FunctionCallSpec => ({
    methodName: "redeem",
    args: { fund, coins: big(coins).toString() },
    gas: GAS_100,
  }),

  cancelOrder: (orderId: number | string): FunctionCallSpec => ({
    methodName: "cancel_order",
    args: { id: String(orderId) },
    gas: GAS_100,
  }),

  buyCoin: (fund: string, nearYocto: bigint | string, minOut: bigint | string): FunctionCallSpec => ({
    methodName: "swap_near_for_coin",
    args: { fund, min_out: big(minOut).toString() },
    gas: GAS_100,
    deposit: big(nearYocto).toString(),
  }),

  sellCoin: (fund: string, coins: bigint | string, minOut: bigint | string): FunctionCallSpec => ({
    methodName: "swap_coin_for_near",
    args: { fund, coins: big(coins).toString(), min_out: big(minOut).toString() },
    gas: GAS_100,
  }),

  bidSeat: (fund: string, bidYocto: bigint | string): FunctionCallSpec => ({
    methodName: "bid_seat",
    args: { fund },
    gas: GAS_150,
    deposit: big(bidYocto).toString(),
  }),
  settleSeatAuction: (fund: string): FunctionCallSpec => ({
    methodName: "settle_seat_auction",
    args: { fund },
    gas: GAS_150,
  }),

  transferCoins: (fund: string, receiverId: string, amount: bigint | string, memo?: string): FunctionCallSpec => ({
    methodName: "mt_transfer",
    args: { receiver_id: receiverId, token_id: fund, amount: big(amount).toString(), ...(memo ? { memo } : {}) },
    gas: GAS_100,
    deposit: ONE_YOCTO,
  }),
};
