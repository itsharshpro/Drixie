import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BudgetLedger {
  load(): { at: number; amount: bigint }[];
  save(spends: { at: number; amount: bigint }[]): void;
}

export function fileLedger(path: string, warn: (msg: string) => void = () => {}): BudgetLedger {
  let warned = false;
  return {
    load() {
      try {
        if (!existsSync(path)) return [];
        const j = JSON.parse(readFileSync(path, "utf8")) as { spends?: { at?: unknown; yocto?: unknown }[] };
        return (j.spends ?? [])
          .filter((s) => typeof s.at === "number" && typeof s.yocto === "string" && /^\d+$/.test(s.yocto))
          .map((s) => ({ at: s.at as number, amount: BigInt(s.yocto as string) }));
      } catch {
        warn(`MCP budget ledger ${path} is unreadable; starting from an empty window`);
        return [];
      }
    },
    save(spends) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.tmp`;
        writeFileSync(tmp, JSON.stringify({ spends: spends.map((s) => ({ at: s.at, yocto: s.amount.toString() })) }));
        renameSync(tmp, path);
      } catch (e) {
        if (!warned) warn(`MCP budget ledger ${path} is not writable (${(e as Error).message}); the daily budget is kept in memory only`);
        warned = true;
      }
    },
  };
}

export class SpendBudget {
  private readonly spends: { at: number; amount: bigint }[] = [];
  private reserved = 0n;

  constructor(
    readonly limit: bigint,
    private readonly now: () => number = Date.now,
    private readonly ledger: BudgetLedger | null = null,
  ) {
    if (ledger) this.spends.push(...ledger.load().sort((a, b) => a.at - b.at));
    this.prune();
  }

  private prune(): void {
    const cutoff = this.now() - DAY_MS;
    while (this.spends.length && (this.spends[0]?.at ?? 0) <= cutoff) this.spends.shift();
  }

  used(): bigint {
    this.prune();
    return this.spends.reduce((s, x) => s + x.amount, 0n) + this.reserved;
  }

  reserve(amount: bigint): { commit: () => void; release: () => void } | null {
    if (amount <= 0n) return { commit: () => {}, release: () => {} };
    if (this.used() + amount > this.limit) return null;
    this.reserved += amount;
    let done = false;
    return {
      commit: () => {
        if (done) return;
        done = true;
        this.reserved -= amount;
        this.spends.push({ at: this.now(), amount });
        this.prune();
        this.ledger?.save(this.spends);
      },
      release: () => {
        if (done) return;
        done = true;
        this.reserved -= amount;
      },
    };
  }
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export const isLoopback = (host: string): boolean => LOOPBACK.has(host);

export function orderGate(host: string, authToken: string | undefined): string | null {
  if (isLoopback(host) || (authToken && authToken.length > 0)) return null;
  return `MCP_HOST is ${host} (not loopback) and MCP_AUTH_TOKEN is empty, so only the read-only tools are served; set MCP_AUTH_TOKEN to enable paid orders`;
}
