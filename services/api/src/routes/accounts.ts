import { randomBytes } from "node:crypto";
import { authChallenges, dz, playerAccounts, users } from "@listed/db";
import { accounts } from "@listed/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../deps";
import { ApiError, badRequest, conflict, unavailable } from "../errors";
import { accountProofMessage, verifyNep413 } from "../lib/nep413";
import { requireUser, sessionKey } from "../lib/session";
import { handleSchema, parse, publicKeySchema } from "../lib/validate";

interface RelayerError {
  error?: { code?: string; message?: string } | string;
  message?: string;
}

const DAY_MS = 86_400_000;
const PROOF_TTL_MS = 5 * 60_000;
const TAKEN = "That name is taken. Try another.";

const proofSchema = z.object({
  nonce: z.string({ required_error: "Send the nonce from POST /v1/accounts/challenge." }).min(40).max(64),
  signature: z.string({ required_error: "Send the NEP-413 signature (base64)." }).min(64).max(200),
});

export function relayerFailure(status: number, code: string | undefined): ApiError {
  if (code === "treasury_low") {
    return unavailable("Sign-ups are paused for a moment while the starter fund is topped up. Try again later.", "signups_paused");
  }
  if (status === 409) return conflict(TAKEN, "handle_taken");
  if (status === 429) return new ApiError(429, "rate_limited", "Too many sign-ups right now. Wait a minute and try again.");
  if (status >= 400 && status < 500) {
    return new ApiError(status, "provision_rejected", "The account service rejected this request. Check the name and try again.");
  }
  return unavailable("Creating your account failed on our side. Try again in a moment.", "provision_failed");
}

export function accountRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, cfg } = deps;
  const perSession = {
    rateLimit: { max: 10, timeWindow: "10 minutes", keyGenerator: (req: FastifyRequest) => sessionKey(req) ?? req.ip },
  };

  app.post("/accounts/challenge", { config: perSession }, async (req) => {
    const user = await requireUser(deps, req);
    const { handle, publicKey } = parse(z.object({ handle: handleSchema, publicKey: publicKeySchema }), req.body);
    const accountId = accounts.player(handle, cfg.root);
    const nonce = randomBytes(32).toString("base64");
    const expiresAt = new Date(Date.now() + PROOF_TTL_MS);
    await db.insert(authChallenges).values({ challenge: nonce, kind: "account", userId: user.id, handle, expiresAt });
    return { nonce, message: accountProofMessage(accountId, publicKey), recipient: cfg.root, accountId, expiresAt: expiresAt.toISOString() };
  });

  app.post("/accounts", { config: perSession }, async (req) => {
    const user = await requireUser(deps, req);
    const { handle, publicKey, proof } = parse(
      z.object({ handle: handleSchema, publicKey: publicKeySchema, proof: proofSchema.optional() }),
      req.body,
    );
    const accountId = accounts.player(handle, cfg.root);

    const mine = await db.select().from(playerAccounts).where(dz.eq(playerAccounts.userId, user.id)).limit(1);
    if (mine[0]) throw conflict(`You already have an account: ${mine[0].accountId}.`, "account_exists");
    const [handleOwner, accountOwner] = await Promise.all([
      db.select({ id: users.id }).from(users).where(dz.eq(users.handle, handle)).limit(1),
      db.select({ id: playerAccounts.userId }).from(playerAccounts).where(dz.eq(playerAccounts.handle, handle)).limit(1),
    ]);
    if (accountOwner[0]?.id === user.id) throw conflict(`You already have an account: ${accountId}.`, "account_exists");
    if ((handleOwner[0] && handleOwner[0].id !== user.id) || accountOwner[0]) throw conflict(TAKEN, "handle_taken");
    if (!cfg.serviceToken) {
      throw unavailable("Account creation isn't configured yet: SERVICE_TOKEN is missing on the API.", "service_token_missing");
    }

    let proven = false;
    if (proof) {
      const rows = await db
        .delete(authChallenges)
        .where(dz.and(dz.eq(authChallenges.challenge, proof.nonce), dz.eq(authChallenges.kind, "account")))
        .returning();
      const ch = rows[0];
      if (!ch || ch.userId !== user.id || ch.handle !== handle || ch.expiresAt.getTime() < Date.now()) {
        throw badRequest("This key proof expired or belongs to another request. Ask for a new challenge and sign it again.", "proof_expired");
      }
      const message = { message: accountProofMessage(accountId, publicKey), nonce: Buffer.from(proof.nonce, "base64"), recipient: cfg.root };
      if (!verifyNep413(publicKey, message, proof.signature)) {
        throw badRequest("That signature doesn't match this key. Sign the challenge with the account's key and try again.", "invalid_proof");
      }
      proven = true;
    }

    const ip = req.ip ?? null;
    const reserved = await db
      .insert(playerAccounts)
      .values({ accountId, userId: user.id, handle, publicKey, createdIp: ip })
      .onConflictDoNothing()
      .returning();
    if (!reserved[0]) {
      const again = await db.select().from(playerAccounts).where(dz.eq(playerAccounts.userId, user.id)).limit(1);
      if (again[0]) throw conflict(`You already have an account: ${again[0].accountId}.`, "account_exists");
      throw conflict(TAKEN, "handle_taken");
    }
    const release = () => db.delete(playerAccounts).where(dz.and(dz.eq(playerAccounts.accountId, accountId), dz.eq(playerAccounts.userId, user.id)));

    const since = new Date(Date.now() - DAY_MS);
    const [fromIp, funded] = await Promise.all([
      ip
        ? db
            .select({ n: dz.sql<number>`count(*)::int` })
            .from(playerAccounts)
            .where(dz.and(dz.eq(playerAccounts.createdIp, ip), dz.gt(playerAccounts.createdAt, since)))
        : Promise.resolve([{ n: 0 }]),
      db
        .select({ n: dz.sql<number>`count(*)::int` })
        .from(playerAccounts)
        .where(dz.and(dz.eq(playerAccounts.funded, true), dz.gt(playerAccounts.createdAt, since))),
    ]);
    if ((fromIp[0]?.n ?? 0) > cfg.signupIpDailyLimit) {
      await release();
      throw new ApiError(429, "signup_limit", "Too many accounts were created from this network today. Try again tomorrow.");
    }
    if ((funded[0]?.n ?? 0) * cfg.starterBalanceNear > cfg.faucetDailyBudgetNear) {
      await release();
      throw unavailable("Sign-ups are paused for today: the daily starter budget is used up. Try again tomorrow.", "signups_paused");
    }

    let res: Response;
    try {
      res = await deps.fetch(`${cfg.relayerUrl}/provision`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-service-token": cfg.serviceToken,

          "x-listed-client-ip": ip ?? "",
          "x-listed-user-id": user.id,
        },
        body: JSON.stringify({ handle, publicKey }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      await release();
      throw unavailable("We couldn't reach the account service. Try again in a moment.", "relayer_unreachable");
    }
    const body = (await res.json().catch(() => ({}))) as RelayerError & { accountId?: string; created?: boolean };
    if (!res.ok || !body.accountId) {
      await release();
      const e = typeof body.error === "object" ? body.error : undefined;
      req.log.warn({ status: res.status, code: e?.code, message: e?.message ?? body.error ?? body.message }, "relayer refused provisioning");
      throw relayerFailure(res.status, e?.code);
    }
    if (body.accountId !== accountId) {
      await release();
      throw conflict(TAKEN, "handle_taken");
    }

    if (body.created === false) {
      if (!proven) {
        await release();
        throw conflict(TAKEN, "handle_taken");
      }
      await db.update(playerAccounts).set({ funded: false }).where(dz.eq(playerAccounts.accountId, accountId));
    }

    await db.update(users).set({ handle }).where(dz.eq(users.id, user.id));
    return { accountId: body.accountId, existing: body.created === false };
  });
}
