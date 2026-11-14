import { createServer, type Server } from "node:http";

export type Handler = (path: string, query: URLSearchParams) => Promise<{ status: number; body: unknown } | null>;

export function startHttp(port: number, host: string, handle: Handler): Server {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET") return send(405, { error: { code: "method_not_allowed", message: "GET only." } });
    handle(url.pathname, url.searchParams)
      .then((out) => (out ? send(out.status, out.body) : send(404, { error: { code: "not_found", message: "Use /health, /bells, /bells/:bell or /black-swans." } })))
      .catch((err: unknown) => send(500, { error: { code: "internal", message: err instanceof Error ? err.message : String(err) } }));
  });
  server.listen(port, host);
  return server;
}
