import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { destination, multistream, pino, stdTimeFunctions, type Logger } from "pino";

export type { Logger };

export function createLogger(logFile: string): Logger {
  const level = process.env.LOG_LEVEL ?? "info";
  const base = { name: "desk" };
  if (!logFile || logFile === "-") return pino({ level, base, timestamp: stdTimeFunctions.isoTime });
  mkdirSync(dirname(logFile), { recursive: true });
  return pino(
    { level, base, timestamp: stdTimeFunctions.isoTime },
    multistream([{ stream: process.stdout }, { stream: destination({ dest: logFile, append: true, mkdir: true, sync: false }) }]),
  );
}
