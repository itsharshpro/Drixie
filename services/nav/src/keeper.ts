import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@listed/db";
import type { ChainClock, ChainFund, FundsChain } from "./chain";
import type { Log } from "./runner";
import {
  badgeKey,
  badgesDone,
  closedSwans,
  earlyBackers,
  holdersOf,
  recordBadge,
  recordQuarterCall,
  reputationAnchor,
  type BadgeTarget,
  type Sql,
} from "./store";

const BADGES_PER_TICK = 4;

export const LIQUIDATION_BPS = 2_000;

interface DnaView {
  season?: number;
  commit?: string | null;
  seed?: string | null;
  revealed?: boolean;
  traits?: unknown;
}

interface AuctionView {
  settled?: boolean;
  ends_at_ns?: string;
}

const nsToMs = (v: unknown): number => {
  try {
    return Number(BigInt(String(v ?? 0)) / 1_000_000n);
  } catch {
    return 0;
  }
};

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function dnaSaltPath(network: string, fund: string): string {
  return join(repoRoot(), ".data", "keys", network, "dna", "funds", `${fund}.json`);
}

export function dnaCommitOf(saltHex: string): string {
  return createHash("sha256").update(Buffer.from(saltHex, "hex")).digest("hex");
}

export function readDnaSalt(network: string, fund: string): { salt: string; commit: string } | null {
  const p = dnaSaltPath(network, fund);
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as { salt?: string };
    if (typeof j.salt !== "string" || !/^[0-9a-f]{64}$/i.test(j.salt)) return null;
    const salt = j.salt.toLowerCase();
    return { salt, commit: dnaCommitOf(salt) };
  } catch {
    return null;
  }
}

export function rotateDnaSalt(network: string, fund: string, revealedSeason: number | null): { salt: string; commit: string } {
  const p = dnaSaltPath(network, fund);
  mkdirSync(join(p, ".."), { recursive: true, mode: 0o700 });
  if (existsSync(p) && revealedSeason !== null) renameSync(p, p.replace(/\.json$/, `.season${revealedSeason}.json`));
  const salt = randomBytes(32).toString("hex");
  const body = { salt, commit: dnaCommitOf(salt) };
  writeFileSync(p, JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
  return body;
}

export function badgeExcluded(contract: string): (account: string) => boolean {
  return (a) => a === contract || a.endsWith(`.${contract}`) || a.startsWith("house-");
}

export class Keeper {
  constructor(
    private readonly chain: FundsChain,
    private readonly sql: Sql,
    private readonly log: Log,
    private readonly network: string,
    private readonly clockId: string,
  ) {}

  async run(clock: ChainClock, funds: ChainFund[]): Promise<void> {
    const chores: [string, () => Promise<void>][] = [
      ["anchor", () => this.anchor(clock, funds)],
      ["seats", () => this.seats(clock, funds)],
      ["promises", () => this.promises()],
      ["dna", () => this.dna(clock, funds)],
      ["badges", () => this.badges(clock)],
      ["liquidation", () => this.liquidation(funds)],
    ];
    for (const [name, fn] of chores) {
      try {
        await fn();
      } catch (err) {
        this.log.warn({ chore: name, err: errMsg(err) }, "keeper chore failed; retrying next tick");
      }
    }
  }

  private async anchor(clock: ChainClock, funds: ChainFund[]): Promise<void> {
    if (clock.lastClosedQuarter === null || funds.length === 0) return;
    const payload = await reputationAnchor(this.sql);
    if (!payload || payload.quarterClosed === null || payload.quarterClosed < clock.lastClosedQuarter) return;
    const onChain = await this.chain.view<{ quarter: number | null }>("get_reputation", { fund: funds[0]!.id });
    if (onChain.quarter !== null && onChain.quarter >= payload.quarterClosed) return;
    const ids = new Set(funds.map((f) => f.id));
    const scores = payload.scores.filter((s) => ids.has(s.fund)).map((s) => ({ fund: s.fund, score: Math.max(0, Math.min(100, Math.floor(s.score))) }));
    if (scores.length === 0) return;
    const res = await this.chain.operatorCall("anchor_reputation", { quarter: payload.quarterClosed, root: payload.root, scores }, 60);
    await recordQuarterCall(this.sql, this.clockId, "anchor", payload.quarterClosed, "anchored", { root: payload.root, scores }, res.txHash, null);
    this.log.info({ quarter: payload.quarterClosed, root: payload.root, scores, txHash: res.txHash }, "reputation anchored");
  }

  private async seats(clock: ChainClock, funds: ChainFund[]): Promise<void> {
    for (const f of funds) {
      const a = await this.chain.view<AuctionView | null>("get_seat_auction", { fund: f.id }).catch(() => null);
      if (!a || a.settled || !a.ends_at_ns || nsToMs(a.ends_at_ns) > clock.nowMs) continue;
      const res = await this.chain.operatorCall("settle_seat_auction", { fund: f.id }, 60);
      this.log.info({ fund: f.id, txHash: res.txHash }, "seat auction settled");
    }
  }

  private async promises(): Promise<void> {
    const payout = await this.chain.view<unknown>("get_promise_payout");
    if (!payout) return;
    const res = await this.chain.operatorCall<boolean>("distribute_promises", {}, 300);
    this.log.info({ done: res.returnValue, txHash: res.txHash }, "promise payout step");
  }

  private async dna(clock: ChainClock, funds: ChainFund[]): Promise<void> {
    for (const f of funds.filter((x) => x.active)) {
      const d = await this.chain.view<DnaView | null>("get_dna", { fund: f.id }).catch(() => null);
      const sealedSeason = d && typeof d.season === "number" ? d.season : null;
      const revealed = Boolean(d && (d.revealed || d.traits));
      if (d && sealedSeason !== null && !revealed && clock.lastSettledSeason !== null && clock.lastSettledSeason >= sealedSeason) {
        const salt = readDnaSalt(this.network, f.id);
        if (!salt || (d.commit && salt.commit !== d.commit.toLowerCase())) {
          this.log.warn({ fund: f.id, season: sealedSeason }, "DNA salt file missing or does not match the on-chain commit; cannot reveal");
        } else {
          const res = await this.chain.operatorCall("reveal_dna", { fund: f.id, salt: salt.salt }, 30);
          await recordQuarterCall(this.sql, this.clockId, "dna", sealedSeason, "revealed", { fund: f.id }, res.txHash, null);
          this.log.info({ fund: f.id, season: sealedSeason, txHash: res.txHash }, "DNA revealed");
        }
        continue; // seal on the next tick, after the reveal is final
      }

      if (sealedSeason === null || (sealedSeason < clock.season && revealed)) {
        const next = rotateDnaSalt(this.network, f.id, sealedSeason);
        const res = await this.chain.operatorCall("seal_dna", { fund: f.id, commit: next.commit }, 30);
        this.log.info({ fund: f.id, season: clock.season, txHash: res.txHash }, "DNA sealed for the new season");
      }
    }
  }

  private async badges(clock: ChainClock): Promise<void> {
    const contract = this.chain.contract;
    const exclude = badgeExcluded(contract);
    const done = await badgesDone(this.sql, contract);
    const targets: BadgeTarget[] = [];
    for (const b of await earlyBackers(this.sql, exclude)) targets.push({ kind: "early_backer", fund: b.fund, season: null, account: b.account });
    if (clock.lastSettledSeason !== null) {
      const [row] = await this.sql<{ detail: unknown }[]>`
        SELECT detail FROM nav_quarters WHERE clock = ${this.clockId} AND kind = 'season' AND ref = ${clock.lastSettledSeason} AND status = 'settled'`;
      const detail = (typeof row?.detail === "string" ? JSON.parse(row.detail) : row?.detail) as { winner?: string | null } | undefined;
      if (detail?.winner) {
        for (const h of await holdersOf(this.sql, detail.winner, null, exclude)) {
          targets.push({ kind: "season_winner_backer", fund: h.fund, season: clock.lastSettledSeason, account: h.account });
        }
      }
    }
    if (clock.lastClosedQuarter !== null) {
      for (const s of await closedSwans(this.sql, this.clockId, clock.lastClosedQuarter)) {
        for (const h of await holdersOf(this.sql, null, new Date(s.startsAt), exclude)) {
          targets.push({ kind: "black_swan_holder", fund: h.fund, season: clock.season, account: h.account });
        }
      }
    }
    let minted = 0;
    for (const t of targets) {
      if (minted >= BADGES_PER_TICK) break;
      if (done.has(badgeKey(t))) continue;
      done.add(badgeKey(t));
      try {
        const res = await this.chain.operatorCall<string>("mint_badge", { account: t.account, kind: t.kind, fund: t.fund, season: t.season }, 60);
        await recordBadge(this.sql, contract, t, { tokenId: typeof res.returnValue === "string" ? res.returnValue : null, txHash: res.txHash, status: "minted", error: null });
        this.log.info({ ...t, tokenId: res.returnValue, txHash: res.txHash }, "investor badge minted");
      } catch (err) {
        const msg = errMsg(err);
        await recordBadge(this.sql, contract, t, { tokenId: null, txHash: null, status: /already minted/i.test(msg) ? "minted" : "failed", error: msg.slice(0, 300) });
        if (!/already minted/i.test(msg)) this.log.warn({ ...t, err: msg }, "badge mint failed");
      }
      minted++;
    }
  }

  private async liquidation(funds: ChainFund[]): Promise<void> {
    for (const f of funds) {
      if (!f.active || f.navSeasonStart <= 0n || f.nav <= 0n) continue;
      if (f.nav * 10_000n >= f.navSeasonStart * BigInt(LIQUIDATION_BPS)) continue;
      const res = await this.chain.operatorCall("retire_fund", { fund: f.id }, 100);
      this.log.warn({ fund: f.id, nav: f.nav.toString(), navSeasonStart: f.navSeasonStart.toString(), txHash: res.txHash }, "fund liquidated (NAV below 20% of season start)");
    }
  }
}
