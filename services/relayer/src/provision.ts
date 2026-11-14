import { timingSafeEqual } from "node:crypto";
import { accounts } from "@listed/shared";
import { ChainCallError, describeFailure, yoctoToNearString, type ChainClient } from "@listed/chain";
import { KeyType, PublicKey } from "near-api-js";
import type { ProvisionLimits } from "./budget";
import type { RelayerConfig } from "./config";
import { badRequest, conflict, forbidden, RelayerError, unauthorized, unavailable } from "./errors";
import type { Signers } from "./signers";

export const HANDLE_RE = /^[a-z0-9]{3,20}$/;

export const RESERVED_HANDLES = new Set([
  "admin", "administrator", "api", "app", "compute", "keeper", "listed", "mod", "moderator", "near",
  "official", "players", "relayer", "root", "staff", "support", "system", "team", "treasury",
]);

export interface ProvisionDeps {
  config: Pick<RelayerConfig, "serviceToken" | "starterBalance"> & { network: string; root: string };
  client: ChainClient;
  signers: Signers;

  limits?: ProvisionLimits;

  who?: { user?: string; ip?: string };
  log?: { warn: (obj: object, msg: string) => void };
}

const ID_RE = /^[A-Za-z0-9:._@-]{1,128}$/;

export function forwardedIdentity(headers: Record<string, unknown>): { user?: string; ip?: string } {
  const one = (v: unknown) => (typeof v === "string" && ID_RE.test(v.trim()) ? v.trim() : undefined);
  const user = one(headers["x-listed-user-id"]) ?? one(headers["x-listed-user"]);
  const ip = one(headers["x-listed-client-ip"]);
  return { ...(user ? { user } : {}), ...(ip ? { ip } : {}) };
}

const LIMIT_MESSAGES = {
  user_limit: "You already created an account today. Sign in with it, or try again tomorrow.",
  ip_limit: "Too many accounts were created from your network today. Try again tomorrow.",
  faucet_budget: "Sign-ups are paused for today. Try again tomorrow.",
} as const;

export function tokenMatches(provided: unknown, expected: string | null): boolean {
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseProvisionBody(body: unknown): { handle: string; publicKey: string } {
  const b = (body ?? {}) as { handle?: unknown; publicKey?: unknown };
  if (typeof b.handle !== "string" || !HANDLE_RE.test(b.handle)) {
    throw badRequest("bad_handle", "Handles are 3–20 characters: lowercase letters and digits only.");
  }
  if (RESERVED_HANDLES.has(b.handle)) throw conflict("handle_taken", "That handle is reserved. Pick another one.");
  if (typeof b.publicKey !== "string") throw badRequest("bad_public_key", "Send the device's public key as \"ed25519:<base58>\".");
  let pk: PublicKey;
  try {
    pk = PublicKey.fromString(b.publicKey);
  } catch {
    throw badRequest("bad_public_key", "The public key isn't valid. It should look like \"ed25519:<base58>\".");
  }
  if (pk.keyType !== KeyType.ED25519) throw badRequest("bad_public_key", "Only ed25519 keys are supported.");
  return { handle: b.handle, publicKey: pk.toString() };
}

const locks = new Map<string, Promise<unknown>>();

export async function handleProvision(
  token: unknown,
  body: unknown,
  deps: ProvisionDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!tokenMatches(token, deps.config.serviceToken)) {
    throw unauthorized("bad_service_token", "Missing or wrong x-service-token header.");
  }
  if (deps.config.network === "mainnet") {
    throw forbidden("provisioning_disabled", "Funded account creation is only available on sandbox and testnet.");
  }
  const { handle, publicKey } = parseProvisionBody(body);
  const accountId = accounts.player(handle, deps.config.root);

  const prev = locks.get(accountId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => provisionOne(accountId, publicKey, deps));
  locks.set(accountId, run);
  try {
    return await run;
  } finally {
    if (locks.get(accountId) === run) locks.delete(accountId);
  }
}

async function provisionOne(accountId: string, publicKey: string, deps: ProvisionDeps) {
  const existing = await existingOutcome(accountId, publicKey, deps.client);
  if (existing) return existing;

  const players = deps.signers.players();
  const balance = await deps.client.getBalance(players.accountId);
  const needed = deps.config.starterBalance + 10n ** 24n / 10n; // starter + 0.1 NEAR for storage/gas
  if (balance < needed) {

    deps.log?.warn({ players: players.accountId, balanceNear: yoctoToNearString(balance, 2) }, "players account is low; sign-ups paused until it is topped up");
    throw unavailable("treasury_low", "Sign-ups are paused right now. Try again later.");
  }
  const hold = deps.limits?.reserve(deps.who ?? {}, deps.config.starterBalance);
  if (hold && !hold.ok) throw new RelayerError(429, hold.code, LIMIT_MESSAGES[hold.code]);
  try {
    const res = await deps.client.createAccount(players, accountId, publicKey, deps.config.starterBalance);
    return {
      status: 201,
      body: { accountId, created: true, txHash: res.txHash, starterBalance: deps.config.starterBalance.toString() },
    };
  } catch (err) {
    if (hold?.ok) hold.release();

    const again = await existingOutcome(accountId, publicKey, deps.client);
    if (again) return again;
    if (err instanceof ChainCallError) throw new RelayerError(502, err.code, err.message, { txHash: err.txHash });
    const human = describeFailure(err);
    throw new RelayerError(502, human.code, human.message);
  }
}

async function existingOutcome(accountId: string, publicKey: string, client: ChainClient) {
  if (!(await client.accountExists(accountId))) return null;
  if (await client.hasAccessKey(accountId, publicKey)) {
    return { status: 200, body: { accountId, created: false } };
  }
  throw conflict("handle_taken", "That handle is taken. Pick another one.");
}
