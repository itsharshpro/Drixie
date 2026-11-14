import type { NearRpc } from "@listed/db/near";

export interface ChainClockOptions {

  thresholdMs?: number;

  maxAgeMs?: number;
  now?: () => number;
}

export class ChainClock {
  private leadMs = 0;
  private measuredAt = 0;
  private inflight: Promise<void> | null = null;
  private readonly thresholdMs: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;

  constructor(
    private readonly rpc: Pick<NearRpc, "block">,
    opts: ChainClockOptions = {},
  ) {
    this.thresholdMs = opts.thresholdMs ?? 30_000;
    this.maxAgeMs = opts.maxAgeMs ?? 15_000;
    this.now = opts.now ?? Date.now;
  }

  async refresh(): Promise<void> {
    if (this.now() - this.measuredAt < this.maxAgeMs) return;
    if (!this.inflight) {
      this.inflight = this.rpc
        .block({ finality: "final" })
        .then((b) => {
          const ns = (b as { header?: { timestamp_nanosec?: string } }).header?.timestamp_nanosec;
          if (ns && /^\d+$/.test(ns)) this.leadMs = Number(BigInt(ns) / 1_000_000n) - this.now();
          this.measuredAt = this.now();
        })
        .catch(() => {

        })
        .finally(() => {
          this.inflight = null;
        });
    }
    await this.inflight;
  }

  lead(): number {
    return Math.abs(this.leadMs) >= this.thresholdMs ? Math.round(this.leadMs) : 0;
  }

  measuredLead(): number {
    return Math.round(this.leadMs);
  }

  chainNow(): Date {
    return new Date(this.now() + this.lead());
  }

  toWall<T extends string | null | undefined>(iso: T): T {
    const lead = this.lead();
    if (!iso || lead === 0) return iso;
    const t = Date.parse(iso);
    return (Number.isNaN(t) ? iso : new Date(t - lead).toISOString()) as T;
  }
}
