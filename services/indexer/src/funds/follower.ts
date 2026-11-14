import { dz, fundCursor, type Db } from "@listed/db";
import type { NearRpc, TxStatus, TxView } from "@listed/db/near";
import { FUND_STREAM_CHANNEL, type FundStreamEvent } from "@listed/shared";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { parseEventLog, type NearEvent } from "../parse";
import { applyFundEvent, newApplyOut, type ApplyOut, type FundEventCtx } from "./apply";
import { upsertCandles } from "./candles";
import { readFundsDeployment, type FundsDeployment } from "./deployment";
import { FundsSnapshot } from "./snapshot";
import { recomputeReputation } from "./reputation";

export const FUNDS_CURSOR_ID = "funds";
const FUND_STANDARDS = new Set(["drixie", "nep245", "nep171"]);
const WINDOW = 12;
const CONCURRENCY = 4;

export const FUND_CHAIN_TABLES = [
  "funds",
  "fund_bells",
  "fund_nav_history",
  "fund_commits",
  "fund_weights_history",
  "fund_orders",
  "fund_trades",
  "fund_candles",
  "fund_balances",
  "fund_cross_holdings",
  "fund_reputation_events",
  "fund_reputation_scores",
  "fund_nfts",
  "fund_promises",
  "fund_seasons",
  "fund_quarters",
  "fund_fees",
  "fund_seat_auctions",
  "fund_events",
  "fund_state",
] as const;

export interface FundsFollowerStatus {
  phase: "starting" | "waiting_for_deployment" | "backfilling" | "live" | "error" | "waiting_for_chain";
  contract: string | null;
  cursor: number | null;
  chainHead: number | null;
  lagBlocks: number | null;
  eventsIndexed: number;
  lastBlockAt: string | null;
  lastError: string | null;
}

export interface FundsFollowerDeps {
  db: Db;
  rpc: NearRpc;
  redis: Redis | null;
  log: Logger;
  network: string;
}

interface Decoded {
  ctx: FundEventCtx;
  ev: NearEvent;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function delegateReceiver(action: unknown): string | null {
  if (!action || typeof action !== "object") return null;
  const d = (action as Record<string, unknown>).Delegate as { delegate_action?: { receiver_id?: string } } | undefined;
  return d?.delegate_action?.receiver_id ?? null;
}

export function txTargets(tx: TxView, contract: string): boolean {
  if (tx.receiver_id === contract) return true;
  return tx.actions.some((a) => delegateReceiver(a) === contract);
}

export function eventsOfTx(st: TxStatus, contract: string): { receiptId: string; logIndex: number; ev: NearEvent }[] {
  const out: { receiptId: string; logIndex: number; ev: NearEvent }[] = [];
  for (const ro of st.receipts_outcome) {
    if (ro.outcome.executor_id !== contract) continue;
    const status = ro.outcome.status;
    if (status && typeof status === "object" && "Failure" in status) continue;
    ro.outcome.logs.forEach((log, i) => {
      const ev = parseEventLog(log);
      if (ev && FUND_STANDARDS.has(ev.standard)) out.push({ receiptId: ro.id, logIndex: i, ev });
    });
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export class FundsFollower {
  readonly status: FundsFollowerStatus = {
    phase: "starting",
    contract: null,
    cursor: null,
    chainHead: null,
    lagBlocks: null,
    eventsIndexed: 0,
    lastBlockAt: null,
    lastError: null,
  };
  private stopped = false;
  private dep: FundsDeployment | null = null;
  private depCheckedAt = 0;
  private snapshot: FundsSnapshot;
  private lastRefresh = 0;
  private lastReputation = 0;
  private reputationDirty = true;

  constructor(private readonly deps: FundsFollowerDeps) {
    this.snapshot = new FundsSnapshot(deps.db, deps.rpc, deps.log);
  }

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<void> {
    let backoff = 1000;
    while (!this.stopped) {
      try {
        const progressed = await this.step();
        this.status.lastError = null;
        backoff = 1000;
        if (!progressed) await sleep(this.dep ? 700 : 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.status.lastError = msg;
        this.status.phase = /fetch failed|ECONNREFUSED|aborted/i.test(msg) ? "waiting_for_chain" : "error";
        this.deps.log.warn({ err: msg }, "funds follower step failed; retrying");
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15_000);
      }
    }
  }

  private deploymentKey(d: FundsDeployment): string {
    return `${d.contract}@${d.startBlock}@${d.deployedAt ?? d.mtimeMs}`;
  }

  private loadDeployment(): FundsDeployment | null {
    const now = Date.now();
    if (this.dep && now - this.depCheckedAt < 5000) return this.dep;
    this.depCheckedAt = now;
    const d = readFundsDeployment(this.deps.network);
    if (d) this.dep = d;
    return this.dep;
  }

  async reset(dep: FundsDeployment, reason: string): Promise<void> {
    this.deps.log.warn({ reason, contract: dep.contract, startBlock: dep.startBlock }, "funds index reset");
    const since = dep.deployedAt && !Number.isNaN(Date.parse(dep.deployedAt)) ? new Date(dep.deployedAt) : new Date(dep.mtimeMs || Date.now());
    await this.deps.db.transaction(async (tx) => {
      await tx.execute(dz.sql.raw(`TRUNCATE ${FUND_CHAIN_TABLES.join(", ")} RESTART IDENTITY`));
      await tx.execute(dz.sql`DELETE FROM fund_notes WHERE at < ${since.toISOString()}::timestamptz`);
      await tx.execute(dz.sql`DELETE FROM fund_brain_bills WHERE at < ${since.toISOString()}::timestamptz`);
      await tx
        .insert(fundCursor)
        .values({ id: FUNDS_CURSOR_ID, contract: dep.contract, height: Math.max(0, dep.startBlock - 1), blockHash: null, deployedAt: this.deploymentKey(dep) })
        .onConflictDoUpdate({
          target: fundCursor.id,
          set: { contract: dep.contract, height: Math.max(0, dep.startBlock - 1), blockHash: null, deployedAt: this.deploymentKey(dep), updatedAt: new Date() },
        });
    });
    this.reputationDirty = true;
  }

  async step(): Promise<boolean> {
    const dep = this.loadDeployment();
    if (!dep) {
      this.status.phase = "waiting_for_deployment";
      return false;
    }
    this.status.contract = dep.contract;
    const { db, rpc } = this.deps;
    let [cur] = await db.select().from(fundCursor).where(dz.eq(fundCursor.id, FUNDS_CURSOR_ID)).limit(1);
    if (!cur || cur.deployedAt !== this.deploymentKey(dep)) {
      await this.reset(dep, cur ? "new deployment file" : "first run");
      [cur] = await db.select().from(fundCursor).where(dz.eq(fundCursor.id, FUNDS_CURSOR_ID)).limit(1);
    }
    if (!cur) return false;
    const head = (await rpc.block({ finality: "final" })).header.height;
    this.status.chainHead = head;
    this.status.cursor = cur.height;
    this.status.lagBlocks = Math.max(0, head - cur.height);
    if (cur.height > head) {
      if (this.deps.network === "sandbox") await this.reset(dep, "cursor ahead of the chain (sandbox reset)");
      return false;
    }
    if (cur.height === head) {
      this.status.phase = "live";
      await this.periodic(dep);
      return false;
    }
    this.status.phase = head - cur.height > 5 ? "backfilling" : "live";
    const from = cur.height + 1;
    const to = Math.min(head, cur.height + WINDOW);
    const heights = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const blocks = await mapLimit(heights, CONCURRENCY, (h) => this.readBlock(h, dep.contract));
    const out = newApplyOut();
    const gameUsdPerNear = await this.snapshot.gameUsdPerNear();
    const quarters = (await this.snapshot.clock()).quarters;
    const spyAt = (at: Date) => this.snapshot.spyAt(at);
    const tokenToFund = (t: string) => this.snapshot.tokenToFund(dep, t);
    const views = { nftToken: (id: string) => this.snapshot.nftToken(dep.contract, id) };
    for (let i = 0; i < heights.length; i++) {
      const b = blocks[i]!;
      const h = heights[i]!;
      if (b.events.length) {
        let fresh = 0;
        await db.transaction(async (tx) => {
          const env = { tx, views, out, gameUsdPerNear, quarters, tokenToFund, spyAt };
          for (const d of b.events) if (await applyFundEvent(env, d.ctx, d.ev)) fresh++;
          await tx.update(fundCursor).set({ height: h, blockHash: b.hash, updatedAt: new Date() }).where(dz.eq(fundCursor.id, FUNDS_CURSOR_ID));
        });
        this.status.eventsIndexed += fresh;
        if (fresh) this.reputationDirty = true;
      }
      if (b.at) this.status.lastBlockAt = b.at.toISOString();
    }
    const last = blocks[blocks.length - 1];
    await db
      .update(fundCursor)
      .set({ height: to, blockHash: last?.hash ?? null, updatedAt: new Date() })
      .where(dz.eq(fundCursor.id, FUNDS_CURSOR_ID));
    this.status.cursor = to;
    await this.afterWindow(dep, out);
    await this.periodic(dep);
    return true;
  }

  private async readBlock(height: number, contract: string): Promise<{ hash: string | null; at: Date | null; events: Decoded[] }> {
    const { rpc } = this.deps;
    let block;
    try {
      block = await rpc.block({ block_id: height });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/UNKNOWN_BLOCK|DB Not Found/i.test(msg)) return { hash: null, at: null, events: [] };
      throw err;
    }
    const at = new Date(Number(BigInt(block.header.timestamp_nanosec) / 1_000_000n));
    const txs: TxView[] = [];
    for (const ch of block.chunks) {
      if (ch.height_included !== height) continue;
      const chunk = await rpc.chunk(ch.chunk_hash);
      for (const tx of chunk.transactions) if (txTargets(tx, contract)) txs.push(tx);
    }
    const events: Decoded[] = [];
    for (const tx of txs) {
      const st = await rpc.txStatus(tx.hash, tx.signer_id, "FINAL");
      for (const e of eventsOfTx(st, contract)) {
        events.push({
          ev: e.ev,
          ctx: { receiptId: e.receiptId, logIndex: e.logIndex, txHash: tx.hash, blockHeight: height, at, signer: tx.signer_id },
        });
      }
    }
    return { hash: block.header.hash, at, events };
  }

  private async afterWindow(dep: FundsDeployment, out: ApplyOut): Promise<void> {
    const log = this.deps.log;
    try {
      if (out.candles.length) await upsertCandles(this.deps.db, out.candles);
      if (out.balances.size) await this.snapshot.refreshBalances(dep, out.balances);
      if (out.fundsTouched.size) await this.snapshot.refreshFunds(dep, out.fundsTouched);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "funds post-window refresh failed");
    }
    const navs = out.stream.filter((e) => e.topic === "nav");
    for (const n of navs) {
      if (n.topic !== "nav") continue;
      const clock = await this.snapshot.clock().catch(() => null);
      out.stream.unshift({
        topic: "bell",
        bell: n.bell,
        at: n.at,
        nextBellAt: clock?.nextBellAt ?? null,
        season: clock?.season ?? 1,
        quarter: clock?.quarter ?? 1,
      });
    }
    await this.publish(out.stream);
  }

  private async publish(events: FundStreamEvent[]): Promise<void> {
    if (!this.deps.redis || !events.length) return;
    try {
      const p = this.deps.redis.pipeline();
      for (const e of events) p.publish(FUND_STREAM_CHANNEL, JSON.stringify(e));
      await p.exec();
    } catch (err) {
      this.deps.log.warn({ err: err instanceof Error ? err.message : String(err) }, "funds publish failed");
    }
  }

  private async periodic(dep: FundsDeployment): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefresh > 15_000) {
      this.lastRefresh = now;
      await this.snapshot.refreshAll(dep).catch((err: unknown) => this.deps.log.warn({ err: err instanceof Error ? err.message : String(err) }, "funds snapshot failed"));
    }
    if (this.reputationDirty && now - this.lastReputation > 20_000) {
      this.lastReputation = now;
      this.reputationDirty = false;
      try {
        const events = await recomputeReputation(this.deps.db);
        if (events.length) await this.publish(events);
      } catch (err) {
        this.deps.log.warn({ err: err instanceof Error ? err.message : String(err) }, "reputation recompute failed");
      }
    }
  }
}
