import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

export type StatusFn = () => Promise<Record<string, unknown> & { ok: boolean }>;

export function buildServer(status: StatusFn): FastifyInstance {
  const app = Fastify({ logger: false });
  const send = async (reply: FastifyReply) => {
    reply.header("cache-control", "no-store");
    try {
      const s = await status();
      return reply.code(s.ok ? 200 : 503).send(s);
    } catch (err) {
      return reply.code(503).send({ ok: false, error: (err as Error).message });
    }
  };
  app.get("/health", (_req, reply) => send(reply));
  app.get("/", (_req, reply) => send(reply));
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: "not_found", message: "Use GET /health." } }));
  return app;
}
