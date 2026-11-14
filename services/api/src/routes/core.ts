import { dz, fundCursor } from "@listed/db";
import type { PublicConfig } from "@listed/shared";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../deps";
import { ChainClock } from "../lib/chain-clock";

const FUNDS_CURSOR_ID = "funds";

export function coreRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, cfg } = deps;
  const clock = deps.clock ?? new ChainClock(deps.rpc);

  app.get("/health", async () => {
    const [cursorRows, head] = await Promise.all([
      db.select().from(fundCursor).where(dz.eq(fundCursor.id, FUNDS_CURSOR_ID)).limit(1),
      deps.rpc
        .block({ finality: "final" })
        .then((b) => b.header.height)
        .catch(() => null),
    ]);
    const cursor = cursorRows[0]?.height ?? null;
    await clock.refresh();
    return {
      ok: true,
      chainHead: head,
      indexerLagBlocks: head !== null && cursor !== null ? Math.max(0, head - cursor) : null,
      indexerCursor: cursor,
      network: cfg.network,

      chainClockLeadMs: clock.measuredLead(),
    };
  });

  app.get("/config", async (): Promise<PublicConfig> => ({
    network: cfg.network,
    rpcUrl: cfg.publicRpcUrl,
    root: cfg.root,
    relayerUrl: cfg.relayerUrl,
    explorerTxUrl: cfg.explorerTxUrl,
  }));
}
