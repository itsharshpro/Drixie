import { createServer, type Server } from "node:http";

export function startHealthServer(port: number, host: string, status: () => Promise<{ ok: boolean } & Record<string, unknown>>): Server {
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET" || (path !== "/health" && path !== "/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "not_found", message: "Use GET /health." } }));
      return;
    }
    status()
      .then((s) => {
        res.writeHead(s.ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(s));
      })
      .catch((err: unknown) => {
        res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      });
  });
  server.listen(port, host);
  return server;
}
