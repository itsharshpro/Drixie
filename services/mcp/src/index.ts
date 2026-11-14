import { createLogger, yoctoToNearStr } from "@listed/agents/lib";
import { isLoopback } from "./budget.js";
import { loadConfig } from "./config.js";
import { startHttp } from "./http.js";
import { MONEY_TOOLS, READ_TOOLS } from "./server.js";

const log = createLogger("mcp");
const cfg = loadConfig(log);
const startedAt = new Date().toISOString();
const env = cfg.env;
const token = env.MCP_AUTH_TOKEN;
const readOnlyOnly = cfg.orderGate !== null;
const tools = [...READ_TOOLS, ...(readOnlyOnly ? [] : MONEY_TOOLS)];

const server = startHttp(cfg.deps, {
  host: env.MCP_HOST,
  port: env.MCP_PORT,
  authToken: token,
  publicRead: env.MCP_PUBLIC_READ === true,
  ratePerMin: env.MCP_RATE_PER_MIN,
  orderRatePerMin: env.MCP_ORDER_RATE_PER_MIN,
  trustProxy: env.MCP_TRUST_PROXY === true,
  health: () => ({
    ok: true,
    service: "mcp",
    network: cfg.network,
    fundsContract: cfg.deps.contract(),
    startedAt,
    endpoint: `http://${env.MCP_HOST}:${env.MCP_PORT}/mcp`,
    tools,
    investor: cfg.deps.investor ? cfg.deps.investor.accountId : null,
    moneyToolsDisabledReason: cfg.deps.investorNote,
    budget: { dailyNear: env.MCP_DAILY_BUDGET_NEAR, usedNear: yoctoToNearStr(cfg.budget.used()), maxOrderNear: env.MCP_MAX_ORDER_NEAR },
    limits: { requestsPerMin: env.MCP_RATE_PER_MIN, ordersPerMin: env.MCP_ORDER_RATE_PER_MIN },
    auth: token ? (env.MCP_PUBLIC_READ ? "bearer for subscribe/redeem; read tools public" : "bearer") : isLoopback(env.MCP_HOST) ? "none (loopback)" : "none (read-only tools only)",
  }),
});

log.info({ host: env.MCP_HOST, port: env.MCP_PORT, investor: cfg.deps.investor?.accountId ?? null, tools }, "Drixie MCP server listening on /mcp");
if (cfg.orderGate) log.warn(cfg.orderGate);
else if (cfg.deps.investorNote) log.warn(cfg.deps.investorNote);
log.info({ dailyBudgetNear: env.MCP_DAILY_BUDGET_NEAR, maxOrderNear: env.MCP_MAX_ORDER_NEAR, ordersPerMin: env.MCP_ORDER_RATE_PER_MIN, budgetFile: cfg.budgetFile }, "investing limits");

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
