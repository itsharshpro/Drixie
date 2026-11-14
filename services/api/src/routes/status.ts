import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../deps";
import type { AgentsStatus, StatusResponse } from "@listed/shared";
import { AgentsStatusCache } from "../lib/agents-status";

export type { StatusResponse };

export function statusRoutes(app: FastifyInstance, deps: AppDeps, agents: AgentsStatusCache): void {
  app.get("/status", async (): Promise<StatusResponse> => ({ network: deps.cfg.network, agents: await agents.get() }));

  app.get("/agents/status", async (): Promise<AgentsStatus> => agents.get());
}
