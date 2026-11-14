import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isLoopback, orderGate } from "./budget.js";
import type { FundsDeps } from "./funds.js";
import { RateLimiter } from "./ratelimit.js";
import { buildServer } from "./server.js";

export interface HttpOptions {
  host: string;
  port: number;
  authToken?: string;

  publicRead?: boolean;

  ratePerMin?: number;

  orderRatePerMin?: number;

  trustProxy?: boolean;
  health: () => Record<string, unknown>;
}

export type Access = { kind: "full" | "read" } | { kind: "denied" };

export function accessFor(opts: Pick<HttpOptions, "host" | "authToken" | "publicRead">, authorization: string | undefined): Access {
  const token = opts.authToken ?? "";
  if (token) {
    if (bearerMatches(authorization, token)) return { kind: "full" };
    return opts.publicRead ? { kind: "read" } : { kind: "denied" };
  }
  return orderGate(opts.host, undefined) === null ? { kind: "full" } : { kind: "read" };
}

export function bearerMatches(authorization: string | undefined, token: string): boolean {
  if (!token) return false;
  const got = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function callerKey(req: IncomingMessage, access: Access, trustProxy: boolean): string {
  if (access.kind === "full" && req.headers.authorization) {
    return `token:${createHash("sha256").update(req.headers.authorization).digest("hex").slice(0, 16)}`;
  }
  return `ip:${clientIp(req, trustProxy)}`;
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const last = xff[xff.length - 1];
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function readBody(req: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("The request body is larger than 1 MB."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch {
        reject(new Error("The request body is not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

export function startHttp(deps: FundsDeps, opts: HttpOptions): Server {
  const loopback = isLoopback(opts.host);
  const allowedHosts = loopback ? [`127.0.0.1:${opts.port}`, `localhost:${opts.port}`, `[::1]:${opts.port}`] : undefined;
  const requests = new RateLimiter(opts.ratePerMin ?? 120);
  const orders = new RateLimiter(opts.orderRatePerMin ?? 6, Math.max(1, Math.min(3, opts.orderRatePerMin ?? 6)));
  const sweeper = setInterval(() => {
    requests.sweep();
    orders.sweep();
  }, 60_000);
  sweeper.unref();

  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/health" && req.method === "GET") return json(res, 200, opts.health());
    if (path !== "/mcp") return json(res, 404, { error: { code: "not_found", message: "The MCP endpoint is POST /mcp." } });
    const access = accessFor(opts, req.headers.authorization);
    if (access.kind === "denied") {
      return json(res, 401, { error: { code: "unauthorized", message: "Send Authorization: Bearer <MCP_AUTH_TOKEN>." } });
    }
    const caller = callerKey(req, access, opts.trustProxy === true);
    const wait = requests.take(caller);
    if (wait > 0) {
      return json(res, 429, { jsonrpc: "2.0", error: { code: -32000, message: `Too many requests. Wait ${wait} s and try again.` }, id: null }, { "retry-after": String(wait) });
    }
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST", "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: this server is stateless; use POST." }, id: null }));
      return;
    }
    let body: unknown;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: (e as Error).message }, id: null });
    }
    const mcp = buildServer(deps, { order: access.kind === "full", caller, orderLimiter: orders });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      ...(allowedHosts ? { enableDnsRebindingProtection: true, allowedHosts } : {}),
    });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      deps.log?.warn({ err: (e as Error).message }, "MCP request failed");
      if (!res.headersSent) json(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error. Try again in a minute." }, id: null });
    }
  });
  server.on("close", () => clearInterval(sweeper));
  server.listen(opts.port, opts.host);
  return server;
}
