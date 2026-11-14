import { createServer, type Server } from "node:http";

export function startHealthServer(port: number, status: () => { phase: string } & Record<string, unknown>, host = "0.0.0.0"): Server {
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET" || (path !== "/health" && path !== "/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "not_found", message: "Use GET /health." } }));
      return;
    }
    const s = status();
    const ok = s.phase !== "error";
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok, ...s }));
  });
  server.listen(port, host);
  return server;
}
