import { accounts } from "@listed/shared";
import { ChainCallError, describeFailure, yoctoToNearString, type ChainClient } from "@listed/chain";
import type { FastifyInstance } from "fastify";
import { RollingBudget } from "./budget";
import { badRequest, forbidden, RelayerError, unauthorized, unavailable } from "./errors";
import { forwardedIdentity, HANDLE_RE, tokenMatches } from "./provision";
import type { RateLimiter } from "./ratelimit";
import type { Signers } from "./signers";

export interface FaucetConfig {

  dailyBudget: bigint;

  maxPerRequest: bigint;

  perAccountPerDay: number;

  perUserPerDay: number;

  reasons: string[];
}

export type FaucetRefusal = "faucet_budget" | "account_limit" | "user_limit";

export class FaucetLimits {
  readonly budget: RollingBudget;
  readonly perAccount: RollingBudget;
  readonly perUser: RollingBudget;

  constructor(cfg: Pick<FaucetConfig, "dailyBudget" | "perAccountPerDay" | "perUserPerDay">, now: () => number = Date.now) {
    this.budget = new RollingBudget(cfg.dailyBudget, now);
    this.perAccount = new RollingBudget(BigInt(cfg.perAccountPerDay), now);
    this.perUser = new RollingBudget(BigInt(cfg.perUserPerDay), now);
  }

  reserve(accountId: string, user: string | undefined, amount: bigint): { ok: true; release: () => void } | { ok: false; code: FaucetRefusal; retryAfterS: number } {
    const retry = (b: RollingBudget, key: string) => Math.max(1, Math.ceil(b.resetsInMs(key) / 1000));

    if (this.budget.limit <= 0n || !this.budget.allows("all", amount)) return { ok: false, code: "faucet_budget", retryAfterS: retry(this.budget, "all") };
    if (!this.perAccount.allows(accountId, 1n)) return { ok: false, code: "account_limit", retryAfterS: retry(this.perAccount, accountId) };
    if (user && !this.perUser.allows(user, 1n)) return { ok: false, code: "user_limit", retryAfterS: retry(this.perUser, user) };
    this.budget.record("all", amount);
    this.perAccount.record(accountId, 1n);
    if (user) this.perUser.record(user, 1n);
    let done = false;
    return {
      ok: true,
      release: () => {
        if (done) return;
        done = true;
        this.budget.undo("all", amount);
        this.perAccount.undo(accountId, 1n);
        if (user) this.perUser.undo(user, 1n);
      },
    };
  }

  spentToday(): bigint {
    return this.budget.spent("all");
  }

  sweep(): void {
    this.budget.sweep();
    this.perAccount.sweep();
    this.perUser.sweep();
  }
}

const REFUSALS: Record<FaucetRefusal, string> = {
  faucet_budget: "Today's top-up budget is used up. Try again tomorrow.",
  account_limit: "This account already got a top-up today.",
  user_limit: "You already got a top-up today.",
};

const REASON_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const YOCTO_RE = /^[0-9]{1,40}$/;

export interface FaucetRequest {
  accountId: string;
  amount: bigint;
  reason: string;
}

export function parseFaucetBody(body: unknown, opts: { root: string; maxPerRequest: bigint; reasons: string[] }): FaucetRequest {
  const b = (body ?? {}) as { accountId?: unknown; amount?: unknown; reason?: unknown };
  const parent = accounts.playersParent(opts.root);
  if (typeof b.accountId !== "string" || !b.accountId.endsWith(`.${parent}`)) {
    throw badRequest("bad_account", `Top-ups go only to player accounts (<handle>.${parent}).`);
  }
  const handle = b.accountId.slice(0, -(parent.length + 1));
  if (!HANDLE_RE.test(handle)) throw badRequest("bad_account", `Top-ups go only to player accounts (<handle>.${parent}).`);
  const raw = typeof b.amount === "number" && Number.isSafeInteger(b.amount) ? String(b.amount) : b.amount;
  if (typeof raw !== "string" || !YOCTO_RE.test(raw) || BigInt(raw) <= 0n) {
    throw badRequest("bad_amount", "Send the amount in yoctoNEAR as a positive whole-number string.");
  }
  const amount = BigInt(raw);
  if (amount > opts.maxPerRequest) {
    throw badRequest("amount_too_large", `One top-up is at most ${yoctoToNearString(opts.maxPerRequest, 4)} NEAR.`);
  }
  if (typeof b.reason !== "string" || !REASON_RE.test(b.reason) || !opts.reasons.includes(b.reason)) {
    throw badRequest("bad_reason", `Unknown top-up reason. Allowed: ${opts.reasons.join(", ") || "none"}.`);
  }
  return { accountId: b.accountId, amount, reason: b.reason };
}

export interface FaucetDeps {
  config: FaucetConfig & { serviceToken: string | null; network: string; root: string };
  client: Pick<ChainClient, "accountExists" | "getBalance" | "transfer">;
  signers: Pick<Signers, "players">;
  limits: FaucetLimits;

  who?: { user?: string };
  log?: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
}

const HEADROOM = 10n ** 24n / 10n;

const locks = new Map<string, Promise<unknown>>();

export async function handleFaucet(token: unknown, body: unknown, deps: FaucetDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!tokenMatches(token, deps.config.serviceToken)) throw unauthorized("bad_service_token", "Missing or wrong x-service-token header.");
  if (deps.config.network === "mainnet") throw forbidden("faucet_disabled", "Top-ups are only available on sandbox and testnet.");
  const req = parseFaucetBody(body, { root: deps.config.root, maxPerRequest: deps.config.maxPerRequest, reasons: deps.config.reasons });

  const prev = locks.get(req.accountId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => topUpOne(req, deps));
  locks.set(req.accountId, run);
  try {
    return await run;
  } finally {
    if (locks.get(req.accountId) === run) locks.delete(req.accountId);
  }
}

async function topUpOne(req: FaucetRequest, deps: FaucetDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!(await deps.client.accountExists(req.accountId))) {

    throw badRequest("unknown_account", "That player account does not exist on chain.");
  }
  const hold = deps.limits.reserve(req.accountId, deps.who?.user, req.amount);
  if (!hold.ok) throw new RelayerError(429, hold.code, REFUSALS[hold.code], { retryAfter: hold.retryAfterS });
  try {
    const players = deps.signers.players();
    const balance = await deps.client.getBalance(players.accountId);
    if (balance < req.amount + HEADROOM) {
      deps.log?.warn({ players: players.accountId, balanceNear: yoctoToNearString(balance, 2) }, "players account is low; top-ups paused until it is topped up");
      throw unavailable("treasury_low", "Top-ups are paused right now. Try again later.");
    }
    const res = await deps.client.transfer(players, req.accountId, req.amount);
    deps.log?.info({ accountId: req.accountId, amountNear: yoctoToNearString(req.amount, 4), reason: req.reason, txHash: res.txHash }, "faucet top-up");
    return { status: 200, body: { accountId: req.accountId, amount: req.amount.toString(), reason: req.reason, txHash: res.txHash } };
  } catch (err) {
    hold.release();
    if (err instanceof RelayerError) throw err;
    if (err instanceof ChainCallError) throw new RelayerError(502, err.code, err.message, { txHash: err.txHash });
    const human = describeFailure(err);
    throw new RelayerError(502, human.code, human.message);
  }
}

export function registerFaucetRoute(
  app: FastifyInstance,
  deps: Omit<FaucetDeps, "who"> & { limiter: RateLimiter },
): void {
  app.post("/faucet", async (req, reply) => {
    const trusted = tokenMatches(req.headers["x-service-token"], deps.config.serviceToken);
    const who = trusted ? forwardedIdentity(req.headers as Record<string, unknown>) : {};
    const buckets = [`ip:${req.ip}`, ...(who.user ? [`user:${who.user}`] : [])];
    const wait = Math.max(...buckets.map((b) => deps.limiter.take(b)));
    if (wait > 0) throw new RelayerError(429, "rate_limited", `Too many top-up requests. Wait ${wait} s and try again.`, { retryAfter: wait });
    const res = await handleFaucet(req.headers["x-service-token"], req.body, { ...deps, who: who.user ? { user: who.user } : {} });
    return reply.code(res.status).send(res.body);
  });
}
