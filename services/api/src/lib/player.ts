import { dz, houseHandle, playerAccounts } from "@listed/db";
import type { FastifyRequest } from "fastify";
import type { AppDeps } from "../deps";
import { ApiError } from "../errors";
import { currentUser, requireUser, type UserRow } from "./session";

export interface Player {
  user: UserRow;
  account: string;
  handle: string | null;
}

export async function requirePlayer(deps: AppDeps, req: FastifyRequest): Promise<Player> {
  const user = await requireUser(deps, req);
  const acct = (await deps.db.select().from(playerAccounts).where(dz.eq(playerAccounts.userId, user.id)).limit(1))[0];
  if (!acct) throw new ApiError(409, "account_required", "Create your trading account first, then try again.");
  return { user, account: acct.accountId, handle: acct.handle };
}

export async function optionalPlayer(deps: AppDeps, req: FastifyRequest): Promise<Player | null> {
  const user = await currentUser(deps, req);
  if (!user) return null;
  const acct = (await deps.db.select().from(playerAccounts).where(dz.eq(playerAccounts.userId, user.id)).limit(1))[0];
  return acct ? { user, account: acct.accountId, handle: acct.handle } : null;
}

export function handleOf(account: string, root: string): string | null {
  const suffix = `.players.${root}`;
  if (account.endsWith(suffix)) return account.slice(0, -suffix.length);
  return houseHandle(account);
}

export function includeHouse(raw: string | undefined): boolean {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes("house");
}

export const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function normalizeAccount(raw: string): string {
  const a = raw.trim().toLowerCase();
  if (a.length < 2 || a.length > 64 || !ACCOUNT_RE.test(a)) {
    throw new ApiError(400, "invalid_account", "That doesn't look like a NEAR account name. Check it and try again.");
  }
  return a;
}
