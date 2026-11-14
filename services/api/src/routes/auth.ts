import { randomBytes } from "node:crypto";
import { authChallenges, dz, emailTokens, passkeys, users } from "@listed/db";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../deps";
import { ApiError, badRequest, unauthorized, unavailable } from "../errors";
import { magicLinkEmail } from "../lib/mailer";
import {
  cookieOptions,
  createSession,
  currentSession,
  currentUser,
  destroySession,
  isRecentLogin,
  meFor,
  randomToken,
  sha256,
  SIGNED_OUT,
  type MeResponse,
} from "../lib/session";
import { handleSchema, parse } from "../lib/validate";

const CHALLENGE_TTL_MS = 5 * 60_000;
const EMAIL_TTL_MS = 15 * 60_000;
const authLimit = { rateLimit: { max: 30, timeWindow: "1 minute" } };

export const EMAIL_BIND_COOKIE = "listed_email_bind";

const reauthRequired = () =>
  new ApiError(403, "reauth_required", "For your safety, sign in again (within the last 10 minutes) before adding a passkey.");

function readSigned(req: FastifyRequest, name: string): string | null {
  const raw = req.cookies?.[name];
  if (!raw) return null;
  const res = req.unsignCookie(raw);
  return res.valid && res.value ? res.value : null;
}

const credentialSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    response: z.object({ clientDataJSON: z.string().min(1) }).passthrough(),
    clientExtensionResults: z.record(z.unknown()).optional().default({}),
    authenticatorAttachment: z.string().optional(),
  })
  .passthrough();

function unwrapCredential(body: unknown): z.infer<typeof credentialSchema> {
  const b = (body ?? {}) as Record<string, unknown>;
  const candidate =
    typeof b.rawId === "string" ? b : (b.credential as Record<string, unknown> | undefined) ?? (b.response as Record<string, unknown> | undefined);
  const parsed = credentialSchema.safeParse(candidate);
  if (!parsed.success) throw badRequest("Send the passkey response from the browser exactly as returned by the passkey prompt.", "invalid_credential");
  return parsed.data;
}

function challengeOf(cred: { response: { clientDataJSON: string } }): string {
  try {
    const cd = JSON.parse(Buffer.from(cred.response.clientDataJSON, "base64url").toString("utf8")) as { challenge?: unknown };
    if (typeof cd.challenge === "string") return cd.challenge;
  } catch {

  }
  throw badRequest("The passkey response is missing its challenge. Start sign-in again.", "invalid_credential");
}

export function authRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, cfg } = deps;

  async function consumeChallenge(challenge: string, kind: "register" | "login") {
    const rows = await db
      .delete(authChallenges)
      .where(dz.and(dz.eq(authChallenges.challenge, challenge), dz.eq(authChallenges.kind, kind)))
      .returning();
    const row = rows[0];
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new ApiError(400, "challenge_expired", "This passkey request expired. Start again.");
    }
    return row;
  }

  app.post("/auth/passkey/register/options", { config: authLimit }, async (req) => {
    const body = parse(z.object({ handle: handleSchema.optional() }).passthrough(), req.body);
    const signedIn = await currentSession(deps, req);
    const existing = signedIn?.user ?? null;

    if (signedIn && !isRecentLogin(signedIn.session)) throw reauthRequired();
    if (body.handle) {
      const taken = await db.select({ id: users.id }).from(users).where(dz.eq(users.handle, body.handle)).limit(1);
      if (taken[0] && taken[0].id !== existing?.id) throw new ApiError(409, "handle_taken", "That name is taken. Try another.");
    }
    const prior = existing ? await db.select().from(passkeys).where(dz.eq(passkeys.userId, existing.id)) : [];
    const webauthnUserId = prior[0]?.webauthnUserId ?? randomBytes(32).toString("base64url");
    const userName = body.handle ?? existing?.handle ?? existing?.email ?? `player-${webauthnUserId.slice(0, 6).toLowerCase()}`;
    const options = await generateRegistrationOptions({
      rpName: cfg.rpName,
      rpID: cfg.rpId,
      userName,
      userDisplayName: userName,
      userID: Buffer.from(webauthnUserId, "base64url"),
      attestationType: "none",
      excludeCredentials: prior.map((p) => ({ id: p.id, transports: p.transports as AuthenticatorTransportFuture[] })),
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    await db.insert(authChallenges).values({
      challenge: options.challenge,
      kind: "register",
      userId: existing?.id ?? null,
      handle: body.handle ?? null,
      webauthnUserId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return options;
  });

  app.post("/auth/passkey/register/verify", { config: authLimit }, async (req, reply) => {
    const cred = unwrapCredential(req.body);
    const pending = await consumeChallenge(challengeOf(cred), "register");

    if (pending.userId) {
      const signedIn = await currentSession(deps, req);
      if (signedIn?.user.id !== pending.userId) {
        throw new ApiError(403, "forbidden", "Sign in to this account again on this device, then add the passkey.");
      }
      if (!isRecentLogin(signedIn.session)) throw reauthRequired();
    }
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: cred as unknown as RegistrationResponseJSON,
        expectedChallenge: pending.challenge,
        expectedOrigin: cfg.webauthnOrigins,
        expectedRPID: cfg.rpId,
        requireUserVerification: false,
      });
    } catch (err) {
      req.log.info({ err: err instanceof Error ? err.message : err }, "passkey registration rejected");
      throw badRequest("We couldn't verify that passkey. Try again, or use a different device.", "passkey_invalid");
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw badRequest("We couldn't verify that passkey. Try again, or use a different device.", "passkey_invalid");
    }
    const info = verification.registrationInfo;
    const user = await db.transaction(async (tx) => {
      let u = pending.userId ? (await tx.select().from(users).where(dz.eq(users.id, pending.userId)).limit(1))[0] : undefined;
      if (!u) {
        let handle = pending.handle;
        if (handle) {
          const taken = await tx.select({ id: users.id }).from(users).where(dz.eq(users.handle, handle)).limit(1);
          if (taken[0]) handle = null;
        }
        u = (await tx.insert(users).values({ handle }).returning())[0]!;
      }
      await tx
        .insert(passkeys)
        .values({
          id: info.credential.id,
          userId: u.id,
          webauthnUserId: pending.webauthnUserId ?? u.id,
          publicKey: Buffer.from(info.credential.publicKey),
          counter: info.credential.counter,
          transports: (info.credential.transports ?? []) as string[],
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
        })
        .onConflictDoNothing();
      return u;
    });
    await createSession(deps, req, reply, user.id);
    return meFor(db, user);
  });

  app.post("/auth/passkey/login/options", { config: authLimit }, async () => {
    const options = await generateAuthenticationOptions({ rpID: cfg.rpId, userVerification: "preferred", allowCredentials: [] });
    await db.insert(authChallenges).values({
      challenge: options.challenge,
      kind: "login",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return options;
  });

  app.post("/auth/passkey/login/verify", { config: authLimit }, async (req, reply) => {
    const cred = unwrapCredential(req.body);
    const pending = await consumeChallenge(challengeOf(cred), "login");
    const pk = (await db.select().from(passkeys).where(dz.eq(passkeys.id, cred.id)).limit(1))[0];
    if (!pk) throw unauthorized("We don't recognize this passkey. Create an account first, or pick a different passkey.");
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: cred as unknown as AuthenticationResponseJSON,
        expectedChallenge: pending.challenge,
        expectedOrigin: cfg.webauthnOrigins,
        expectedRPID: cfg.rpId,
        credential: {
          id: pk.id,
          publicKey: new Uint8Array(pk.publicKey),
          counter: pk.counter,
          transports: pk.transports as AuthenticatorTransportFuture[],
        },
        requireUserVerification: false,
      });
    } catch (err) {
      req.log.info({ err: err instanceof Error ? err.message : err }, "passkey login rejected");
      throw unauthorized("We couldn't verify that passkey. Try again.");
    }
    if (!verification.verified) throw unauthorized("We couldn't verify that passkey. Try again.");
    await db
      .update(passkeys)
      .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
      .where(dz.eq(passkeys.id, pk.id));
    const user = (await db.select().from(users).where(dz.eq(users.id, pk.userId)).limit(1))[0];
    if (!user) throw unauthorized("This passkey's account no longer exists. Create a new account.");
    await createSession(deps, req, reply, user.id);
    return meFor(db, user);
  });

  app.post("/auth/email/start", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (req, reply) => {
    if (!deps.mailer) throw unavailable("Email sign-in isn't configured yet. Use a passkey.", "email_unavailable");
    const { email } = parse(
      z.object({ email: z.string({ required_error: "Enter your email address." }).trim().toLowerCase().email("Enter a valid email address, like you@example.com.") }),
      req.body,
    );
    const recent = await db
      .select({ n: dz.sql<number>`count(*)::int` })
      .from(emailTokens)
      .where(dz.and(dz.eq(emailTokens.email, email), dz.gt(emailTokens.createdAt, new Date(Date.now() - 3_600_000))));
    if ((recent[0]?.n ?? 0) >= 5) throw new ApiError(429, "rate_limited", "We've sent several links already. Check your inbox or wait an hour.");
    const token = randomToken();

    const requester = await currentUser(deps, req);

    const bind = readSigned(req, EMAIL_BIND_COOKIE) ?? randomToken();
    reply.setCookie(EMAIL_BIND_COOKIE, bind, cookieOptions(deps, Math.round(EMAIL_TTL_MS / 1000)));
    await db.insert(emailTokens).values({
      tokenHash: sha256(token),
      email,
      expiresAt: new Date(Date.now() + EMAIL_TTL_MS),
      requestedBy: requester?.id ?? null,
      browserHash: sha256(bind),
    });
    const link = `${cfg.webOrigins[0] ?? "http://localhost:3000"}/signin/verify?token=${encodeURIComponent(token)}`;
    try {
      await deps.mailer.send({ to: email, ...magicLinkEmail(link) });
    } catch (err) {
      req.log.error({ err: err instanceof Error ? err.message : err }, "magic link email failed");
      throw unavailable("We couldn't send the email right now. Try again in a minute, or use a passkey.", "email_failed");
    }
    return { ok: true };
  });

  app.post("/auth/email/verify", { config: authLimit }, async (req, reply) => {
    const { token } = parse(z.object({ token: z.string({ required_error: "Open the sign-in link from your email again." }).min(10) }), req.body);
    const bind = readSigned(req, EMAIL_BIND_COOKIE);
    const tokenHash = sha256(token);
    const pending = (await db.select().from(emailTokens).where(dz.eq(emailTokens.tokenHash, tokenHash)).limit(1))[0];
    if (!pending || pending.usedAt || pending.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(400, "link_expired", "This sign-in link has expired or was already used. Request a new one.");
    }

    if (!bind || !pending.browserHash || sha256(bind) !== pending.browserHash) {
      throw new ApiError(
        400,
        "link_other_browser",
        "Open this link in the browser where you asked for it, or request a new link from this browser.",
      );
    }
    const rows = await db
      .update(emailTokens)
      .set({ usedAt: new Date() })
      .where(dz.and(dz.eq(emailTokens.tokenHash, tokenHash), dz.isNull(emailTokens.usedAt), dz.gt(emailTokens.expiresAt, new Date())))
      .returning();
    const row = rows[0];
    if (!row) throw new ApiError(400, "link_expired", "This sign-in link has expired or was already used. Request a new one.");
    const current = await currentUser(deps, req);
    const user = await db.transaction(async (tx) => {
      const byEmail = (await tx.select().from(users).where(dz.eq(users.email, row.email)).limit(1))[0];
      if (byEmail) return byEmail;

      if (current && !current.email && row.requestedBy === current.id) {
        return (await tx.update(users).set({ email: row.email }).where(dz.eq(users.id, current.id)).returning())[0]!;
      }
      return (await tx.insert(users).values({ email: row.email }).returning())[0]!;
    });
    await createSession(deps, req, reply, user.id);
    return meFor(db, user);
  });

  app.get("/me", async (req): Promise<MeResponse> => {
    const user = await currentUser(deps, req);
    return user ? meFor(db, user) : SIGNED_OUT;
  });

  app.post("/auth/logout", async (req, reply) => {
    await destroySession(deps, req, reply);
    return { ok: true };
  });
}
