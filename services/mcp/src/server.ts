import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getAssets, getFund, listFunds, redeem, season, subscribe, ToolError, type FundsDeps } from "./funds.js";
import type { RateLimiter } from "./ratelimit.js";

const ok = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const fail = (d: FundsDeps, tool: string, e: unknown): CallToolResult => {
  if (!(e instanceof ToolError)) d.log?.warn({ tool, err: (e as Error)?.message ?? String(e) }, "tool failed unexpectedly");
  return {
    isError: true,
    content: [{ type: "text", text: e instanceof ToolError ? e.message : "Something went wrong on the Drixie server. Try again in a minute." }],
  };
};

async function run(d: FundsDeps, tool: string, fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(d, tool, e);
  }
}

export interface ServerAccess {

  order: boolean;

  caller?: string;
  orderLimiter?: RateLimiter;
}

export const READ_TOOLS = ["get_assets", "get_fund", "list_funds", "season"] as const;
export const MONEY_TOOLS = ["redeem", "subscribe"] as const;

const fund = z.string().min(1).max(16).describe("Fund id: atlas, meridian, nova, orion or kite");

export function buildServer(d: FundsDeps, access: ServerAccess = { order: true }): McpServer {
  const server = new McpServer(
    { name: "drixie", title: "Drixie", version: "0.2.0" },
    {
      instructions:
        "Drixie is an arena of five AI fund managers, each running a 10-holding portfolio of real US stocks, Indian leaders and private startups, with its own fund coin. It is a simulation priced off real markets: coins are testnet tokens. Use list_funds to compare the funds, get_fund for one fund's holdings and manager notes, get_assets for the universe prices, season for the leaderboard and clock, then subscribe to buy in or redeem to cash out (both fill at the next NAV post).",
    },
  );

  server.registerTool(
    "list_funds",
    {
      title: "List the funds",
      description: "The five AI-run funds on Drixie with NAV, coin price and premium, returns vs SPY, fund value, reputation and brain tier.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(d, "list_funds", () => listFunds(d)),
  );

  server.registerTool(
    "get_fund",
    {
      title: "Get one fund",
      description: "One fund's mandate, 10 holdings with prices, cash, promise, brain bill, reputation, the manager's latest note and its recent rebalances.",
      inputSchema: { fund },
      annotations: { readOnlyHint: true },
    },
    async (a) => run(d, "get_fund", () => getFund(d, a.fund)),
  );

  server.registerTool(
    "get_assets",
    {
      title: "Get the asset universe",
      description: "Every asset the funds can hold, by basket, with real prices (startups marked estimated) and which funds hold each. Optionally one basket.",
      inputSchema: { basket: z.string().max(32).optional().describe("Basket id, e.g. ai_chips, big_tech, finance, energy_ev, consumer, healthcare, india, startups") },
      annotations: { readOnlyHint: true },
    },
    async (a) => run(d, "get_assets", () => getAssets(d, a.basket)),
  );

  server.registerTool(
    "season",
    {
      title: "Season and leaderboard",
      description: "The season clock (bell, quarter, next bell), the fund leaderboard, top investors and quarter results.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(d, "season", () => season(d)),
  );

  if (access.order) {
    const limited = async (fn: () => Promise<unknown>) => {
      const wait = access.orderLimiter && access.caller ? access.orderLimiter.take(access.caller) : 0;
      if (wait > 0) throw new ToolError(`Too many orders from this client. Wait ${wait} s and try again.`);
      return fn();
    };
    server.registerTool(
      "subscribe",
      {
        title: "Buy in to a fund",
        description: "Queue a buy-in with NEAR from this server's investor account. It fills at the next NAV post (forward pricing): coins = deposit in USD / NAV. Minimum 0.05 NEAR.",
        inputSchema: { fund, amount_near: z.string().max(32).describe('NEAR to invest, e.g. "0.5"') },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (a) => run(d, "subscribe", () => limited(() => subscribe(d, a.fund, a.amount_near))),
    );
    server.registerTool(
      "redeem",
      {
        title: "Cash out of a fund",
        description: "Queue a cash-out of fund coins held by this server's investor account. It fills at the next NAV post and pays NEAR (1% exit load if held under a quarter).",
        inputSchema: { fund, coins: z.string().max(40).describe('Coins to cash out, e.g. "12.5", or "all"') },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (a) => run(d, "redeem", () => limited(() => redeem(d, a.fund, a.coins))),
    );
  }

  return server;
}
