import { createHash, randomBytes } from "node:crypto";
import { dz, playerAccounts, sessions, users, type Db } from "@listed/db";
import type { Me, MeResponse } from "@listed/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppDeps } from "../deps";
import { unauthorized } from "../errors";

export const SESSION_COOKIE = "listed_session";

export const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export type UserRow = typeof users.$inferSelect;

export function cookieOptions(deps: AppDeps, maxAgeSec: number) {
  return {
    path: "/",
    httpOnly: true,
    signed: true,
    secure: deps.cfg.cookieSecure || deps.cfg.cookieSameSite === "none",
    sameSite: deps.cfg.cookieSameSite,
    maxAge: maxAgeSec,
  } as const;
}

export async function createSession(deps: AppDeps, req: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
  const token = randomToken();
  const ttlSec = Math.round(deps.cfg.sessionTtlDays * 86_400);
  await deps.db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + ttlSec * 1000),
    userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
    ip: req.ip ?? null,
  });
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(deps, ttlSec));
}

function tokenFrom(req: FastifyRequest): string | null {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return null;
  const res = req.unsignCookie(raw);
  return res.valid && res.value ? res.value : null;
}

export type SessionRow = typeof sessions.$inferSelect;

export async function currentUser(deps: AppDeps, req: FastifyRequest): Promise<UserRow | null> {
  return (await currentSession(deps, req))?.user ?? null;
}

export const RECENT_LOGIN_MS = 10 * 60_000;

export function isRecentLogin(session: Pick<SessionRow, "createdAt">, now = Date.now()): boolean {
  return now - session.createdAt.getTime() <= RECENT_LOGIN_MS;
}

export async function currentSession(deps: AppDeps, req: FastifyRequest): Promise<{ user: UserRow; session: SessionRow } | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  const id = sha256(token);
  const rows = await deps.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, dz.eq(users.id, sessions.userId))
    .where(dz.eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= Date.now()) {
    await deps.db.delete(sessions).where(dz.eq(sessions.id, id));
    return null;
  }

  if (Date.now() - row.session.lastSeenAt.getTime() > 60_000) {
    await deps.db.update(sessions).set({ lastSeenAt: new Date() }).where(dz.eq(sessions.id, id));
  }
  return row;
}

export function sessionKey(req: FastifyRequest): string | null {
  const token = tokenFrom(req);
  return token ? sha256(token).slice(0, 32) : null;
}

export async function requireUser(deps: AppDeps, req: FastifyRequest): Promise<UserRow> {
  const user = await currentUser(deps, req);
  if (!user) throw unauthorized("Sign in to continue. Your session may have expired.");
  return user;
}

export async function destroySession(deps: AppDeps, req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = tokenFrom(req);
  if (token) await deps.db.delete(sessions).where(dz.eq(sessions.id, sha256(token)));
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export type SignedOutMe = Extract<MeResponse, { signedIn: false }>;
export type { MeResponse };

export const SIGNED_OUT: SignedOutMe = { signedIn: false, userId: null, handle: null, accountId: null, email: null };

export async function meFor(db: Db, user: UserRow): Promise<Me & { signedIn: true }> {
  const acct = await db.select().from(playerAccounts).where(dz.eq(playerAccounts.userId, user.id)).limit(1);
  return {
    signedIn: true,
    userId: user.id,
    handle: acct[0]?.handle ?? user.handle ?? null,
    accountId: acct[0]?.accountId ?? null,
    email: user.email ?? null,
  };
}
