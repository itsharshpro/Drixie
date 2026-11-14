import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { AppDeps } from "./deps";
import { registerErrorHandling } from "./errors";
import { FundsHub } from "./funds/stream";
import { AgentsStatusCache } from "./lib/agents-status";
import { ChainClock } from "./lib/chain-clock";
import { accountRoutes } from "./routes/accounts";
import { authRoutes } from "./routes/auth";
import { coreRoutes } from "./routes/core";
import { fundsRoutes } from "./routes/funds";
import { internalRoutes } from "./routes/internal";
import { statusRoutes } from "./routes/status";

export async function buildApp(input: AppDeps, opts: { logger?: FastifyServerOptions["logger"] } = {}): Promise<FastifyInstance> {
  const deps: AppDeps = {
    ...input,
    clock: input.clock ?? new ChainClock(input.rpc),
  };
  const fundsHub = input.fundsHub ?? new FundsHub();
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: deps.cfg.trustProxy,
    bodyLimit: deps.cfg.maxContentBytes + 64 * 1024,

    disableRequestLogging: process.env.LOG_REQUESTS !== "1",
  });
  if (process.env.LOG_REQUESTS !== "1") {
    app.addHook("onResponse", async (req, reply) => {
      const ms = reply.elapsedTime;
      if (reply.statusCode >= 500 || ms > 2000) {
        req.log.warn({ method: req.method, url: req.url.slice(0, 200), status: reply.statusCode, ms: Math.round(ms) }, "slow or failed request");
      }
    });
  }

  await app.register(cors, {
    origin: (origin, cb) => {

      if (!origin || deps.cfg.webOrigins.includes(origin)) cb(null, origin ?? true);
      else cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-service-token"],
    maxAge: 600,
  });
  await app.register(cookie, { secret: deps.cfg.sessionSecret });
  await app.register(rateLimit, { global: false });

  const defaultJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (text.trim() === "") return done(null, {});
    defaultJson(req, text, done);
  });
  registerErrorHandling(app);

  app.get("/", async () => ({ name: "drixie-api", health: "/v1/health" }));
  const agents = new AgentsStatusCache(deps.cfg.agentsUrl, deps.fetch);

  await app.register(
    async (v1) => {
      coreRoutes(v1, deps);
      authRoutes(v1, deps);
      accountRoutes(v1, deps);
      statusRoutes(v1, deps, agents);
      internalRoutes(v1, deps);

      fundsRoutes(v1, { ...deps, fundsHub });
    },
    { prefix: "/v1" },
  );
  return app;
}
