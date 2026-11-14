import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, code = "invalid_request") => new ApiError(400, code, message);
export const unauthorized = (message = "Sign in to continue.") => new ApiError(401, "unauthorized", message);
export const forbidden = (message: string) => new ApiError(403, "forbidden", message);
export const notFound = (message: string, code = "not_found") => new ApiError(404, code, message);
export const conflict = (message: string, code = "conflict") => new ApiError(409, code, message);
export const unavailable = (message: string, code = "unavailable") => new ApiError(503, code, message);

export function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { code, message } });
}

export function zodMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "Some fields are missing or invalid. Check the request and try again.";
  const field = first.path.join(".");
  const msg = first.message.replace(/\.$/, "");
  return field ? `Check "${field}": ${msg}.` : `${msg}.`;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | ApiError | ZodError | Error, req, reply) => {
    if (err instanceof ApiError) return sendError(reply, err.status, err.code, err.message);
    if (err instanceof ZodError) return sendError(reply, 400, "invalid_request", zodMessage(err));
    const fe = err as FastifyError;
    if (fe.validation) return sendError(reply, 400, "invalid_request", "Some fields are missing or invalid. Check the request and try again.");
    if (fe.statusCode === 429) {
      return sendError(reply, 429, "rate_limited", "Too many requests. Wait a few seconds and try again.");
    }
    if (fe.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return sendError(reply, 413, "too_large", "That's too much text. Shorten it and try again.");
    }
    if (fe.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" || fe.code === "FST_ERR_CTP_EMPTY_JSON_BODY" || fe.code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      return sendError(reply, 400, "invalid_json", "Send a valid JSON body with Content-Type: application/json.");
    }
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      return sendError(reply, fe.statusCode, "bad_request", fe.message || "The request could not be processed. Check it and try again.");
    }
    req.log.error({ err }, "unhandled error");
    return sendError(reply, 500, "internal", "Something went wrong on our side. Try again in a moment.");
  });
  app.setNotFoundHandler((req, reply) =>
    sendError(reply, 404, "route_not_found", `There's no ${req.method} ${req.url.split("?")[0]} endpoint. Check the URL.`),
  );
}
