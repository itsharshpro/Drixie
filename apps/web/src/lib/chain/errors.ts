const RULES: Array<[RegExp, string]> = [

  [/bought or received in this block|from the next block/i, "Shares you just bought can be sold from the next block, about a second from now. Try again."],
  [/proposal bond|bond_required/i, "Proposing needs a refundable 0.05 NEAR bond from your balance. Add NEAR and try again."],
  [/only holders at the opening bell|pro-rata share/i, "For now only shareholders from the opening bell can subscribe, up to their share. Everyone else can join in the second half of the offering."],
  [/not enough unlocked shares|rights shares still locked/i, "Some of your shares are locked (by a vote or a rights offering) and can't be sold yet. Try a smaller amount."],
  [/voted on an open proposal|shares unlock at/i, "Your shares unlock when the vote you joined ends. Try again after it closes."],
  [/open proposals; wait/i, "You already have 3 open proposals. Wait for one to close, then try again."],
  [/lock at least .* shares .*to propose/i, "You need more shares to make a proposal. Buy more and try again."],
  [/not issued by the operator/i, "Drixie didn't issue that agent key. Start the launch again to get a fresh one."],
  [/only the current charter owner/i, "Only the charter's current owner can do that."],
  [/NotEnoughBalance|LackBalanceForState|not enough balance|insufficient/i, "Your account doesn't have enough NEAR for that. Lower the amount and try again."],
  [/slippage|min_shares_out|min_near_out|less than min|price moved/i, "The price moved before your order filled. Check the new quote and try again."],
  [/max_price|price.*above|service_price/i, "The company changed its price a moment ago. Check the new price and try again."],
  [/rate.?limit|too many/i, "You're going a little fast. Wait a few seconds and try again."],
  [/InvalidNonce|nonce/i, "Another action from this account is still settling. Try again in a second."],
  [/Expired|expired|block height/i, "That request expired before it reached the network. Try again."],
  [/AccessKeyDoesNotExist|InvalidAccessKey|access key/i, "This device's key isn't valid for your account. Import your key in Settings."],
  [/AccountDoesNotExist|does not exist/i, "That account doesn't exist on this network yet. Finish setting up your account first."],
  [/not allowed|allowlist|receiver.*not/i, "Drixie can't send that action for you. Refresh the page and try again."],
  [/Bankrupt|halted|Paused/i, "Trading and jobs are paused for this company right now."],
  [/not.*open|voting.*closed|ended/i, "That window has closed. Refresh to see the latest state."],
  [/already/i, "That's already done. Refresh to see the latest state."],
  [/Failed to fetch|NetworkError|ECONNREFUSED|fetch failed/i, "Can't reach Drixie right now. Check your connection, then try again."],
];

export function humanChainError(err: unknown): string {
  const raw = extractMessage(err);
  for (const [re, msg] of RULES) if (re.test(raw)) return msg;
  if (raw && raw.length < 140 && /[.!?]$/.test(raw) && !/[{}[\]_]/.test(raw)) return raw; // already a human sentence
  return "That didn't go through, and any amount you sent was returned. Try again.";
}

export function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
