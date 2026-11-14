import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BrainBillRecord, FundsApi, ManagerNoteRecord } from "./api.js";

const DAY = (d: Date | string) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);

class Ring<T> {
  private items: T[] = [];
  constructor(private readonly max: number) {}
  push(x: T): void {
    this.items.push(x);
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
  }
  all(): readonly T[] {
    return this.items;
  }
  get size(): number {
    return this.items.length;
  }
}

export class FundJournal {
  private readonly notes = new Ring<ManagerNoteRecord>(300);
  private readonly bills = new Ring<BrainBillRecord>(2000);
  private unsentBills: BrainBillRecord[] = [];
  private unsentNotes: ManagerNoteRecord[] = [];
  private flushing = false;
  state = { notesPosted: 0, billsPosted: 0, lastPostError: null as string | null, routes: { notes: null as boolean | null, bills: null as boolean | null } };

  constructor(
    readonly dir: string,
    private readonly keepDays = 6,
  ) {
    mkdirSync(dir, { recursive: true });
    this.load();
  }

  private file(kind: "notes" | "bills", day: string): string {
    return join(this.dir, `${kind}-${day}.jsonl`);
  }

  private days(kind: "notes" | "bills"): string[] {
    try {
      return readdirSync(this.dir)
        .map((f) => new RegExp(`^${kind}-(\\d{4}-\\d{2}-\\d{2})\\.jsonl$`).exec(f)?.[1])
        .filter((d): d is string => Boolean(d))
        .sort();
    } catch {
      return [];
    }
  }

  private load(): void {
    for (const kind of ["notes", "bills"] as const) {
      const days = this.days(kind);
      for (const old of days.slice(0, Math.max(0, days.length - this.keepDays))) rmSync(this.file(kind, old), { force: true });
      for (const d of days.slice(-this.keepDays)) {
        const f = this.file(kind, d);
        if (!existsSync(f)) continue;
        for (const line of readFileSync(f, "utf8").split("\n")) {
          if (!line.trim()) continue;
          try {
            const rec = JSON.parse(line);
            if (kind === "notes") {
              this.notes.push(rec as ManagerNoteRecord);
            } else {
              this.bills.push(rec as BrainBillRecord);
            }
          } catch {

          }
        }
      }
    }
    this.unsentNotes = [...this.notes.all()].slice(-100);
    this.unsentBills = [...this.bills.all()];
  }

  private append(kind: "notes" | "bills", rec: { at: string }): void {
    try {
      appendFileSync(this.file(kind, DAY(rec.at)), `${JSON.stringify(rec)}\n`);
    } catch {

    }
  }

  addNote(n: ManagerNoteRecord): void {
    this.notes.push(n);
    this.unsentNotes.push(n);
    if (this.unsentNotes.length > 300) this.unsentNotes.splice(0, this.unsentNotes.length - 300);
    this.append("notes", n);
  }

  addBill(b: BrainBillRecord): void {
    this.bills.push(b);
    this.unsentBills.push(b);
    if (this.unsentBills.length > 4000) this.unsentBills.splice(0, this.unsentBills.length - 4000);
    this.append("bills", b);
  }

  recentNotes(fund?: string, limit = 20): ManagerNoteRecord[] {
    return this.notes
      .all()
      .filter((n) => !fund || n.fund === fund)
      .slice(-limit)
      .reverse();
  }

  billsSince(sinceMs: number, fund?: string): BrainBillRecord[] {
    return this.bills.all().filter((b) => Date.parse(b.at) >= sinceMs && (!fund || b.fund === fund));
  }

  billTotal(fund: string, sinceMs: number): number {
    return Number(this.billsSince(sinceMs, fund).reduce((s, b) => s + b.billUsd, 0).toFixed(6));
  }

  recentBillAmounts(fund: string, n = 8): number[] {
    return this.bills
      .all()
      .filter((b) => b.fund === fund)
      .slice(-n)
      .map((b) => b.billUsd);
  }

  async flush(api: FundsApi): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.unsentNotes.length) {
        const n = this.unsentNotes[0] as ManagerNoteRecord;
        const r = await api.postNote(n);
        if (r !== "ok") {
          this.state.routes.notes = r === "unsupported" ? false : this.state.routes.notes;
          this.state.lastPostError = r === "unsupported" ? "notes route missing" : "notes post failed";
          break;
        }
        this.state.routes.notes = true;
        this.unsentNotes.shift();
        this.state.notesPosted++;
      }
      while (this.unsentBills.length) {
        const batch = this.unsentBills.slice(0, 200);
        const r = await api.postBills(batch);
        if (r !== "ok") {
          this.state.routes.bills = r === "unsupported" ? false : this.state.routes.bills;
          this.state.lastPostError = r === "unsupported" ? "brain-bills route missing" : "brain-bills post failed";
          break;
        }
        this.state.routes.bills = true;
        this.unsentBills.splice(0, batch.length);
        this.state.billsPosted += batch.length;
      }
    } finally {
      this.flushing = false;
    }
  }

  get pending(): { notes: number; bills: number } {
    return { notes: this.unsentNotes.length, bills: this.unsentBills.length };
  }
}
