const DAY_MS = 24 * 60 * 60 * 1000;

export class RollingBudget {
  private readonly entries = new Map<string, { at: number; amount: bigint }[]>();

  constructor(

    readonly limit: bigint,
    private readonly now: () => number = Date.now,
  ) {}

  private list(key: string): { at: number; amount: bigint }[] {
    const cutoff = this.now() - DAY_MS;
    const l = (this.entries.get(key) ?? []).filter((e) => e.at > cutoff);
    if (l.length) this.entries.set(key, l);
    else this.entries.delete(key);
    return l;
  }

  spent(key: string): bigint {
    return this.list(key).reduce((s, e) => s + e.amount, 0n);
  }

  allows(key: string, amount = 0n): boolean {
    if (this.limit <= 0n) return true;
    const spent = this.spent(key);
    return amount > 0n ? spent + amount <= this.limit : spent < this.limit;
  }

  record(key: string, amount: bigint): void {
    if (amount <= 0n) return;
    const l = this.list(key);
    l.push({ at: this.now(), amount });
    this.entries.set(key, l);
  }

  undo(key: string, amount: bigint): void {
    const l = this.list(key);
    for (let i = l.length - 1; i >= 0; i--) {
      if (l[i]?.amount === amount) {
        l.splice(i, 1);
        break;
      }
    }
    if (l.length) this.entries.set(key, l);
    else this.entries.delete(key);
  }

  resetsInMs(key: string): number {
    const first = this.list(key)[0];
    return first ? Math.max(0, first.at + DAY_MS - this.now()) : 0;
  }

  sweep(): void {
    for (const key of [...this.entries.keys()]) this.list(key);
  }

  get size(): number {
    return this.entries.size;
  }
}

export class GasBudgets {
  readonly perSender: RollingBudget;
  readonly total: RollingBudget;

  constructor(perSenderYocto: bigint, totalYocto: bigint, now: () => number = Date.now) {
    this.perSender = new RollingBudget(perSenderYocto, now);
    this.total = new RollingBudget(totalYocto, now);
  }

  refusal(sender: string): { code: "sender_gas_budget" | "relayer_gas_budget"; retryAfterS: number } | null {
    if (!this.total.allows("all")) return { code: "relayer_gas_budget", retryAfterS: Math.ceil(this.total.resetsInMs("all") / 1000) };
    if (!this.perSender.allows(sender)) return { code: "sender_gas_budget", retryAfterS: Math.ceil(this.perSender.resetsInMs(sender) / 1000) };
    return null;
  }

  record(sender: string, yocto: bigint): void {
    this.perSender.record(sender, yocto);
    this.total.record("all", yocto);
  }

  sweep(): void {
    this.perSender.sweep();
    this.total.sweep();
  }
}

export class ProvisionLimits {
  readonly perUser: RollingBudget;
  readonly perIp: RollingBudget;
  readonly faucet: RollingBudget;

  constructor(opts: { perUserPerDay: number; perIpPerDay: number; dailyFaucet: bigint }, now: () => number = Date.now) {
    this.perUser = new RollingBudget(BigInt(opts.perUserPerDay), now);
    this.perIp = new RollingBudget(BigInt(opts.perIpPerDay), now);
    this.faucet = new RollingBudget(opts.dailyFaucet, now);
  }

  reserve(who: { user?: string; ip?: string }, amount: bigint): { ok: true; release: () => void } | { ok: false; code: "user_limit" | "ip_limit" | "faucet_budget" } {
    if (who.user && !this.perUser.allows(who.user, 1n)) return { ok: false, code: "user_limit" };
    if (who.ip && !this.perIp.allows(who.ip, 1n)) return { ok: false, code: "ip_limit" };
    if (!this.faucet.allows("all", amount)) return { ok: false, code: "faucet_budget" };
    if (who.user) this.perUser.record(who.user, 1n);
    if (who.ip) this.perIp.record(who.ip, 1n);
    this.faucet.record("all", amount);
    let done = false;
    return {
      ok: true,
      release: () => {
        if (done) return;
        done = true;
        if (who.user) this.perUser.undo(who.user, 1n);
        if (who.ip) this.perIp.undo(who.ip, 1n);
        this.faucet.undo("all", amount);
      },
    };
  }

  sweep(): void {
    this.perUser.sweep();
    this.perIp.sweep();
    this.faucet.sweep();
  }
}
