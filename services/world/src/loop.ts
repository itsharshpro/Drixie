export interface LoopStatus {
  intervalMs: number;
  running: boolean;
  runs: number;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  nextRunAt: string | null;

  last: Record<string, unknown> | null;
}

export interface LoopLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export class Loop {
  readonly status: LoopStatus;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private current: Promise<void> | null = null;

  constructor(
    readonly name: string,
    intervalMs: number,
    private readonly job: () => Promise<Record<string, unknown>>,
    private readonly log: LoopLogger,
  ) {
    this.status = { intervalMs, running: false, runs: 0, lastRunAt: null, lastOkAt: null, lastError: null, nextRunAt: null, last: null };
  }

  async runNow(): Promise<void> {
    if (this.current) return this.current;
    this.current = this.execute().finally(() => {
      this.current = null;
    });
    return this.current;
  }

  private async execute(): Promise<void> {
    const started = Date.now();
    this.status.running = true;
    this.status.runs += 1;
    this.status.lastRunAt = new Date(started).toISOString();
    try {
      const summary = await this.job();
      this.status.last = summary;
      this.status.lastOkAt = new Date().toISOString();
      this.status.lastError = null;
      this.log.info({ job: this.name, ms: Date.now() - started, ...summary }, `${this.name} run finished`);
    } catch (err) {
      this.status.lastError = err instanceof Error ? err.message : String(err);
      this.log.warn({ job: this.name, ms: Date.now() - started, err: this.status.lastError }, `${this.name} run failed; will retry next tick`);
    } finally {
      this.status.running = false;
    }
  }

  start(initialDelayMs = 0, align?: { offsetMs: number }): void {
    const schedule = (ms: number) => {
      if (this.stopped) return;
      this.status.nextRunAt = new Date(Date.now() + ms).toISOString();
      this.timer = setTimeout(() => {
        void this.runNow().then(() => schedule(align ? msUntilAligned(Date.now(), this.status.intervalMs, align.offsetMs) : this.status.intervalMs));
      }, ms);
    };
    schedule(initialDelayMs);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.status.nextRunAt = null;
    if (this.current) await this.current.catch(() => undefined);
  }
}

export function msUntilAligned(now: number, periodMs: number, offsetMs: number): number {
  const base = Math.ceil((now - offsetMs) / periodMs) * periodMs + offsetMs;
  const next = base - now < 1_000 ? base + periodMs : base;
  return next - now;
}
