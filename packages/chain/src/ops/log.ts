export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  step(msg: string): void;
}

export function createLogger(tag: string): Logger {
  const t0 = Date.now();
  const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;
  return {
    info: (msg) => console.log(`[${tag}] ${stamp()}   ${msg}`),
    warn: (msg) => console.warn(`[${tag}] ${stamp()} ! ${msg}`),
    step: (msg) => console.log(`[${tag}] ${stamp()} > ${msg}`),
  };
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
