import { PAYABLE_FUNDS_METHODS, RELAY_FUNDS_METHODS } from "@listed/chain";
import type { FunctionCallView } from "./delegate";
import { badRequest, forbidden } from "./errors";

export interface SignedRequest {
  senderId: string;
  receiverId: string;
  nonce: bigint;
  calls: Array<FunctionCallView | null>;
  actionKinds: string[];

  maxBlockHeight?: bigint;
}

export const MAX_DELEGATE_DEPOSIT = 1n;

export type ReceiverKind = "funds";

export interface PolicyContext {

  kindOf(receiverId: string): ReceiverKind | null;

  isProtocolAccount(accountId: string): boolean;
  senderSuffixes: string[];
  currentHeight: bigint;
  maxTtlBlocks: number;
  maxActions: number;
}

const MAX_TOTAL_GAS = 300n * 10n ** 12n;
const FUNDS_METHODS: ReadonlySet<string> = new Set(RELAY_FUNDS_METHODS);

const FUNDS_PAYABLE: ReadonlySet<string> = new Set(PAYABLE_FUNDS_METHODS);

export const allowedMethods = (_kind: ReceiverKind): ReadonlySet<string> => FUNDS_METHODS;

const receiverLabel = (_kind: ReceiverKind): string => "the Drixie funds contract";

export function checkPolicy(d: SignedRequest, ctx: PolicyContext, opts: { allowDeposits?: boolean } = {}): ReceiverKind {
  const kind = ctx.kindOf(d.receiverId);
  if (!kind) {
    throw forbidden(
      "receiver_not_allowed",
      `The relayer only forwards actions to the Drixie funds contract, and ${d.receiverId} isn't it.`,
    );
  }

  if (ctx.isProtocolAccount(d.senderId)) {
    throw forbidden("sender_not_allowed", `${d.senderId} is a protocol account and can't use the relayer.`);
  }
  if (ctx.senderSuffixes.length > 0 && !ctx.senderSuffixes.some((s) => d.senderId === s || d.senderId.endsWith(`.${s}`))) {
    throw forbidden("sender_not_allowed", "Only Drixie player accounts can use the gasless relayer. Sign in to get one.");
  }

  if (d.calls.length === 0) throw badRequest("no_actions", "The signed request has no actions.");
  if (d.calls.length > ctx.maxActions) {
    throw badRequest("too_many_actions", `Send at most ${ctx.maxActions} actions per request.`);
  }

  const allow = allowedMethods(kind);
  let totalGas = 0n;
  d.calls.forEach((call, i) => {
    if (!call) {
      throw forbidden(
        "action_not_allowed",
        `Only contract calls can be relayed (action ${i + 1} is a ${d.actionKinds[i] ?? "different"} action).`,
      );
    }
    if (!allow.has(call.methodName)) {
      throw forbidden(
        "method_not_allowed",
        `"${call.methodName}" can't be called through the relayer on ${receiverLabel(kind)}.`,
      );
    }
    if (call.gas <= 0n) throw badRequest("bad_gas", `Action ${i + 1} attaches no gas.`);
    if (call.deposit < 0n) throw badRequest("bad_deposit", `Action ${i + 1} has a negative deposit.`);
    if (FUNDS_PAYABLE.has(call.methodName)) {

      if (!opts.allowDeposits) {
        throw forbidden(
          "deposit_not_allowed",
          `"${call.methodName}" attaches NEAR, so it must be signed as a regular transaction from your own account. Update the app and try again.`,
        );
      }
      if (call.deposit <= MAX_DELEGATE_DEPOSIT) {
        throw badRequest("deposit_required", `Attach the NEAR amount to "${call.methodName}".`);
      }
    }
    if (!opts.allowDeposits && call.deposit > MAX_DELEGATE_DEPOSIT) {
      throw forbidden(
        "deposit_not_allowed",
        "Actions that attach NEAR must be signed as a regular transaction from your own account. Update the app and try again.",
      );
    }
    totalGas += call.gas;
  });
  if (totalGas > MAX_TOTAL_GAS) {
    throw badRequest("too_much_gas", "The request attaches more than 300 TGas in total. Lower the gas and try again.");
  }

  if (d.nonce <= 0n) throw badRequest("bad_nonce", "The request's nonce is invalid. Refresh and try again.");
  if (d.maxBlockHeight === undefined) return kind; // signed transactions: the chain checks the block hash age
  if (d.maxBlockHeight <= ctx.currentHeight) {
    throw badRequest("expired", "This request expired before it reached the relayer. Please try again.");
  }
  if (d.maxBlockHeight > ctx.currentHeight + BigInt(ctx.maxTtlBlocks)) {
    throw badRequest(
      "expiry_too_far",
      `The request's expiry is too far in the future (max ${ctx.maxTtlBlocks} blocks). Check your device clock and try again.`,
    );
  }
  return kind;
}
