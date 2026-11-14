import { pino, type Logger } from "pino";

export type { Logger };

export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
    base: { svc: name },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
