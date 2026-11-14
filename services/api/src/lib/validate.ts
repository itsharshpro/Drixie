import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { z, type ZodTypeAny } from "zod";
import type { AppDeps } from "../deps";
import { ApiError, badRequest } from "../errors";

export const HANDLE_RE = /^[a-z0-9]{3,20}$/;
export const HANDLE_MESSAGE = "Enter 3–20 lowercase letters or numbers.";
export const TICKER_RE = /^[A-Z]{2,6}$/;

export const handleSchema = z
  .string({ required_error: HANDLE_MESSAGE, invalid_type_error: HANDLE_MESSAGE })
  .trim()
  .toLowerCase()
  .regex(HANDLE_RE, HANDLE_MESSAGE);

export const publicKeySchema = z
  .string({ required_error: "Send the account's public key as ed25519:<base58>." })
  .trim()
  .regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/, "Send the account's public key as ed25519:<base58>.");

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data ?? {}) as z.infer<S>;
}

export function normalizeTicker(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!TICKER_RE.test(t)) throw badRequest("Tickers are 2–6 letters, like BABEL. Check the ticker and try again.", "invalid_ticker");
  return t;
}

export function hasServiceToken(deps: AppDeps, req: FastifyRequest): boolean {
  const expected = deps.cfg.serviceToken;
  const got = req.headers["x-service-token"];
  if (!expected || typeof got !== "string") return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireServiceToken(deps: AppDeps, req: FastifyRequest): void {
  if (!deps.cfg.serviceToken) {
    throw new ApiError(503, "service_token_missing", "SERVICE_TOKEN isn't configured on the API. Set it in the repo-root .env.");
  }
  if (!hasServiceToken(deps, req)) {
    throw new ApiError(401, "invalid_service_token", "Send a valid x-service-token header to use this endpoint.");
  }
}
