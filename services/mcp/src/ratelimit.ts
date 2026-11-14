export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private readonly refillPerMs: number;

  constructor(
    perMinute: number,
    private readonly burst: number = Math.max(1, Math.ceil(perMinute / 4)),
    private readonly now: () => number = Date.now,
  ) {
    this.refillPerMs = perMinute / 60_000;
  }

  take(key: string): number {
    if (this.refillPerMs <= 0) return 0;
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: t };
    b.tokens = Math.min(this.burst, b.tokens + (t - b.at) * this.refillPerMs);
    b.at = t;
    this.buckets.set(key, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil((1 - b.tokens) / this.refillPerMs / 1000));
  }

  sweep(): void {
    const t = this.now();
    for (const [k, b] of this.buckets) {
      if (b.tokens + (t - b.at) * this.refillPerMs >= this.burst) this.buckets.delete(k);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}
