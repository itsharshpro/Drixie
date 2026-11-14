import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../util/hash.js";
import type { Plan } from "./rules.js";

const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function sortedEntries(plan: Plan): { asset: string; bps: number }[] {
  return Object.entries(plan.weights)
    .filter(([, b]) => b > 0)
    .map(([asset, bps]) => ({ asset, bps: Math.trunc(bps) }))
    .sort((a, b) => byteOrder(a.asset, b.asset));
}

export function commitPreimage(fund: string, bell: number, plan: Plan, salt: string): string {
  const body = sortedEntries(plan)
    .map((w) => `${w.asset}:${w.bps}`)
    .join(",");
  return `${fund}|${bell}|${body}|cash:${Math.trunc(plan.cashBps)}|${salt}`;
}

export function commitHashFor(fund: string, bell: number, plan: Plan, salt: string): string {
  return sha256Hex(commitPreimage(fund, bell, plan, salt));
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export interface PendingCommit {
  fund: string;
  bell: number;
  plan: Plan;
  salt: string;
  hash: string;
  note: string;
  think: "normal" | "deep";
  tier: "best" | "primary" | "small";
  adjusted: boolean;
  cross: { fund: string; side: "buy" | "sell"; usd: number }[];
  promise: { targetBps: number; bondBps: number } | null;
  createdAt: string;
  commitTx: string | null;
  committedAt: string | null;
  revealTx: string | null;
  revealedAt: string | null;

  error: string | null;
}

export class PendingStore {
  private readonly mem = new Map<string, PendingCommit>();

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      names = [];
    }
    for (const n of names) {
      if (!/^[a-z0-9-]+-\d+\.json$/.test(n)) continue;
      try {
        const p = JSON.parse(readFileSync(join(dir, n), "utf8")) as PendingCommit;
        if (p && typeof p.fund === "string" && Number.isInteger(p.bell)) this.mem.set(`${p.fund}-${p.bell}`, p);
      } catch {
        rmSync(join(dir, n), { force: true });
      }
    }
  }

  private file(fund: string, bell: number): string {
    return join(this.dir, `${fund}-${bell}.json`);
  }

  save(p: PendingCommit): void {
    const f = this.file(p.fund, p.bell);
    const tmp = `${f}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(p, null, 2));
      renameSync(tmp, f);
    } catch {

    }
    this.mem.set(`${p.fund}-${p.bell}`, p);
  }

  get(fund: string, bell: number): PendingCommit | null {
    return this.mem.get(`${fund}-${bell}`) ?? null;
  }

  list(fund: string): PendingCommit[] {
    return [...this.mem.values()].filter((p) => p.fund === fund).sort((a, b) => a.bell - b.bell);
  }

  prune(fund: string, bell: number, keep = 8): void {
    for (const p of this.list(fund)) {
      if (p.bell >= bell - keep) continue;
      this.mem.delete(`${p.fund}-${p.bell}`);
      rmSync(this.file(fund, p.bell), { force: true });
    }
  }
}
