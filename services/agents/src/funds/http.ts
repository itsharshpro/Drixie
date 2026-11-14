import { timingSafeEqual } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";

export interface FundsHttpRoutes {
  health: () => Record<string, unknown>;
  funds: () => Record<string, unknown>;
  notes: (fund: string | undefined, limit: number) => unknown;
  internalAi: (days: number) => Record<string, unknown>;
  bills: (sinceMs: number, fund: string | undefined) => unknown;
  serviceToken?: string;
}

function tokenOk(given: string | string[] | undefined, expected: string | undefined): boolean {
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body, null, 2));
}

export function startFundsHttp(port: number, r: FundsHttpRoutes, host = "0.0.0.0"): Server {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method !== "GET") return send(res, 405, { error: { code: "method_not_allowed", message: "Only GET is served here." } });
      if (url.pathname === "/health" || url.pathname === "/") return send(res, 200, r.health());
      if (url.pathname === "/funds") return send(res, 200, r.funds());
      if (url.pathname === "/funds/notes") {
        const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
        const fund = url.searchParams.get("fund")?.toLowerCase() || undefined;
        return send(res, 200, { notes: r.notes(fund, limit) });
      }
      if (url.pathname.startsWith("/internal/")) {
        if (!tokenOk(req.headers["x-service-token"], r.serviceToken)) {
          return send(res, 401, { error: { code: "unauthorized", message: "This internal route needs the service token." } });
        }
        if (url.pathname === "/internal/ai") {
          const days = Math.min(31, Math.max(1, Number.parseInt(url.searchParams.get("days") ?? "1", 10) || 1));
          return send(res, 200, r.internalAi(days));
        }
        if (url.pathname === "/internal/funds/brain-bills") {
          const since = Date.parse(url.searchParams.get("since") ?? "");
          const fund = url.searchParams.get("fund")?.toLowerCase() || undefined;
          return send(res, 200, { records: r.bills(Number.isFinite(since) ? since : Date.now() - 24 * 3600_000, fund) });
        }
      }
      send(res, 404, { error: { code: "not_found", message: "Routes: /health, /funds, /funds/notes." } });
    } catch (e) {
      send(res, 500, { error: { code: "internal", message: (e as Error).message.slice(0, 200) } });
    }
  });
  server.listen(port, host);
  return server;
}
