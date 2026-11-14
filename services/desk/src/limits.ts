const HOUR_MS = 3_600_000;

export class HourlyLimiter {
  private tokens: number;
  private last: number;
  private readonly stamps: number[] = [];

  constructor(
    readonly perHour: number,
    readonly burst: number,
    private readonly now: () => number = Date.now,

    history: number[] = [],
  ) {
    const t = now();
    this.stamps.push(...history.filter((s) => s > t - HOUR_MS && s <= t).sort((a, b) => a - b));
    this.tokens = Math.min(burst, perHour);
    this.last = t;
  }

  history(): number[] {
    this.refill();
    return [...this.stamps];
  }

  private refill(): number {
    const t = this.now();
    const rate = this.perHour / HOUR_MS;
    this.tokens = Math.min(Math.min(this.burst, this.perHour), this.tokens + (t - this.last) * rate);
    this.last = t;
    while (this.stamps.length && (this.stamps[0] as number) <= t - HOUR_MS) this.stamps.shift();
    return t;
  }

  canTake(): boolean {
    this.refill();
    return this.perHour > 0 && this.tokens >= 1 && this.stamps.length < this.perHour;
  }

  tryTake(): boolean {
    if (!this.canTake()) return false;
    this.tokens -= 1;
    this.stamps.push(this.now());
    return true;
  }

  refund(): void {
    this.stamps.pop();
    this.tokens = Math.min(Math.min(this.burst, this.perHour), this.tokens + 1);
  }

  usedLastHour(): number {
    this.refill();
    return this.stamps.length;
  }

  leftThisHour(): number {
    return Math.max(0, this.perHour - this.usedLastHour());
  }

  waitMs(): number {
    const t = this.refill();
    if (this.perHour <= 0) return Number.POSITIVE_INFINITY;
    const byTokens = this.tokens >= 1 ? 0 : Math.ceil((1 - this.tokens) / (this.perHour / HOUR_MS));
    const byWindow = this.stamps.length < this.perHour ? 0 : (this.stamps[0] as number) + HOUR_MS - t;
    return Math.max(byTokens, byWindow);
  }
}

export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export interface BudgetSnapshot {
  day: string;
  spent: string;
}

export class DailyBudget {
  private day: string;
  private spentYocto: bigint;

  constructor(
    readonly limit: bigint,
    snapshot: BudgetSnapshot | null = null,
    private readonly now: () => number = Date.now,
  ) {
    const today = utcDay(now());
    this.day = snapshot?.day === today ? snapshot.day : today;
    this.spentYocto = snapshot?.day === today ? BigInt(snapshot.spent) : 0n;
  }

  private roll(): void {
    const today = utcDay(this.now());
    if (today !== this.day) {
      this.day = today;
      this.spentYocto = 0n;
    }
  }

  canSpend(amount: bigint): boolean {
    this.roll();
    return amount >= 0n && this.spentYocto + amount <= this.limit;
  }

  spend(amount: bigint): void {
    this.roll();
    this.spentYocto += amount;
  }

  refund(amount: bigint, spentOnDay: string): void {
    this.roll();
    if (spentOnDay !== this.day) return;
    this.spentYocto = this.spentYocto > amount ? this.spentYocto - amount : 0n;
  }

  spent(): bigint {
    this.roll();
    return this.spentYocto;
  }

  left(): bigint {
    this.roll();
    return this.limit > this.spentYocto ? this.limit - this.spentYocto : 0n;
  }

  today(): string {
    this.roll();
    return this.day;
  }

  snapshot(): BudgetSnapshot {
    this.roll();
    return { day: this.day, spent: this.spentYocto.toString() };
  }
}
