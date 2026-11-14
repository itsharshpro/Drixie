export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();
  private readonly refillPerMs: number;

  constructor(
    perMinute: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    this.refillPerMs = perMinute / 60_000;
  }

  take(key: string): number {
    if (this.refillPerMs <= 0 && this.burst <= 0) return 0; // disabled
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.burst, updated: t };
    b.tokens = Math.min(this.burst, b.tokens + (t - b.updated) * this.refillPerMs);
    b.updated = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      this.buckets.set(key, b);
      return 0;
    }
    this.buckets.set(key, b);
    return this.refillPerMs > 0 ? Math.ceil((1 - b.tokens) / this.refillPerMs / 1000) : 60;
  }

  sweep(): void {
    const t = this.now();
    for (const [k, b] of this.buckets) {
      const tokens = Math.min(this.burst, b.tokens + (t - b.updated) * this.refillPerMs);
      if (tokens >= this.burst) this.buckets.delete(k);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}
