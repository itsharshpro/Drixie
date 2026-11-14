import { FUND_SEEDS, type FundId } from "@listed/shared";
import { clampScore, REP, roundScore } from "./rules";
import { fundName, pct, plural, ratioPct, signedPct, usd } from "./format";
import { sha256Hex } from "./sha256";
import type {
  CrossTradeInput,
  DealInput,
  EngineState,
  FundState,
  Instant,
  PromiseInput,
  QuarterCloseInput,
  RebalanceInput,
  ReputationChange,
  ReputationConfig,
  ReputationInput,
  RuleKind,
  Weights,
} from "./types";

const DAY_MS = 86_400_000;

export function defaultConfig(over: Partial<ReputationConfig> = {}): ReputationConfig {
  const allowancePct: Record<FundId, number> = {};
  const names: Record<FundId, string> = {};
  for (const s of Object.values(FUND_SEEDS)) {
    allowancePct[s.id] = s.turnoverAllowancePct;
    names[s.id] = s.name;
  }
  return {
    allowancePct: { ...allowancePct, ...over.allowancePct },
    names: { ...names, ...over.names },
    dayMs: over.dayMs ?? DAY_MS,
    quarterMs: over.quarterMs ?? DAY_MS,
  };
}

export function emptyState(): EngineState {
  return { version: 1, seq: 0, funds: {}, raises: [] };
}

export function genesisHead(fund: FundId): string {
  return sha256Hex(`drixie-reputation-v1|${fund}`);
}

export function canonicalChange(c: ReputationChange): string {
  return [c.id, c.kind, c.at, c.bell ?? "", c.raw, c.delta, c.score].join("|");
}

export function toMs(at: Instant): number {
  if (typeof at === "number") return at;
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) throw new Error(`bad instant: ${at}`);
  return ms;
}

export function toWeightMap(w: Weights): Record<string, number> {
  const out: Record<string, number> = {};
  const entries: [string, number][] = Array.isArray(w) ? w.map((e) => [e.asset, e.bps]) : Object.entries(w);
  for (const [asset, bps] of entries) {
    if (!Number.isFinite(bps) || bps < 0) throw new Error(`bad weight for ${asset}: ${bps}`);
    if (bps > 0) out[asset] = (out[asset] ?? 0) + Math.round(bps);
  }
  return out;
}

function union(...maps: Record<string, number>[]): string[] {
  const s = new Set<string>();
  for (const m of maps) for (const k of Object.keys(m)) s.add(k);
  return [...s].sort();
}

export class ReputationEngine {
  readonly config: ReputationConfig;
  private state: EngineState;

  constructor(config: Partial<ReputationConfig> = {}, state?: EngineState) {
    this.config = defaultConfig(config);
    this.state = state ? structuredClone(state) : emptyState();
  }

  score(fund: FundId): number {
    return this.state.funds[fund]?.score ?? REP.start;
  }

  scores(): { fund: FundId; score: number }[] {
    return Object.keys(this.state.funds)
      .sort()
      .map((fund) => ({ fund, score: this.state.funds[fund]!.score }));
  }

  quarterTurnoverPct(fund: FundId): number {
    return roundScore((this.state.funds[fund]?.quarterTurnoverBps ?? 0) / 100);
  }

  snapshot(): EngineState {
    return structuredClone(this.state);
  }

  apply(input: ReputationInput): ReputationChange[] {
    switch (input.type) {
      case "fund_created": {
        const fs = this.fund(input.fund);
        const w = toWeightMap(input.weights);
        if (Object.keys(w).length > 0) {
          fs.weights = w;
          fs.cashBps = Math.max(0, Math.round(input.cashBps));
          fs.history = [{ bell: -1, weights: w }];
        }
        return [];
      }
      case "rebalance":
        return this.onRebalance(input);
      case "holders":
        this.fund(input.fund).outsideBps = input.outsideBps;
        return [];
      case "cross_trade":
        return this.onCrossTrade(input);
      case "deal":
        return this.onDeal(input);
      case "promise":
        return this.onPromise(input);
      case "quarter_close":
        return this.onQuarterClose(input);
    }
  }

  applyAll(inputs: Iterable<ReputationInput>): ReputationChange[] {
    const out: ReputationChange[] = [];
    for (const i of inputs) out.push(...this.apply(i));
    return out;
  }

  private fund(id: FundId): FundState {
    let fs = this.state.funds[id];
    if (!fs) {
      fs = {
        score: REP.start,
        weights: null,
        cashBps: 0,
        outsideBps: 0,
        quarterTurnoverBps: 0,
        excessSteps: 0,
        frontRuns: 0,
        history: [],
        flipFrom: {},
        gainDay: -1,
        gainUsed: 0,
        head: genesisHead(id),
        changes: 0,
        lots: {},
        sells: {},
      };
      this.state.funds[id] = fs;
    }
    return fs;
  }

  private name(id: FundId): string {
    return fundName(id, this.config.names);
  }

  private allowancePct(id: FundId): number {
    return this.config.allowancePct[id] ?? 100;
  }

  private record(fund: FundId, kind: RuleKind, raw: number, at: number, bell: number | null, key: string, reason: string): ReputationChange {
    const fs = this.fund(fund);
    let delta = raw;
    let capped = false;
    if (raw > 0) {
      const day = Math.floor(at / this.config.dayMs);
      if (fs.gainDay !== day) {
        fs.gainDay = day;
        fs.gainUsed = 0;
      }
      const room = Math.max(0, roundScore(REP.dailyGainCap - fs.gainUsed));
      if (delta > room) {
        delta = room;
        capped = true;
      }
    }
    const before = fs.score;
    const unclamped = roundScore(before + delta);
    const after = clampScore(unclamped);
    const clamped = after !== unclamped;
    delta = roundScore(after - before);
    if (raw > 0) fs.gainUsed = roundScore(fs.gainUsed + delta);
    fs.score = after;

    let text = reason;
    if (capped) text += delta > 0 ? ` Gain capped at +${REP.dailyGainCap} a day.` : ` No gain: today's +${REP.dailyGainCap} cap is used.`;
    if (clamped) text += after >= REP.max ? " The score is already at the top (100)." : " The score cannot go below 0.";

    const change: ReputationChange = {
      id: `${kind}:${fund}:${key}`,
      seq: ++this.state.seq,
      fund,
      kind,
      at,
      bell,
      raw,
      delta,
      score: after,
      reason: text,
      capped,
      clamped,
    };
    fs.head = sha256Hex(`${fs.head}|${canonicalChange(change)}`);
    fs.changes += 1;
    return change;
  }

  private onRebalance(input: RebalanceInput): ReputationChange[] {
    const fs = this.fund(input.fund);
    const at = toMs(input.at);
    const { bell, fund } = input;
    if (input.outsideBps !== undefined) fs.outsideBps = input.outsideBps;
    const next = toWeightMap(input.weights);
    const cash = Math.max(0, Math.round(input.cashBps));
    const out: ReputationChange[] = [];

    if (fs.weights === null) {
      fs.weights = next;
      fs.cashBps = cash;
      fs.history = [{ bell, weights: next }];
      return out;
    }

    const prev = fs.weights;
    for (const h of fs.history) if (h.bell === -1) h.bell = bell - 1;
    const deltas: Record<string, number> = {};
    let sumAbs = Math.abs(cash - fs.cashBps);
    for (const a of union(prev, next)) {
      const d = (next[a] ?? 0) - (prev[a] ?? 0);
      if (d !== 0) {
        deltas[a] = d;
        sumAbs += Math.abs(d);
      }
    }

    fs.quarterTurnoverBps += input.turnoverBps ?? sumAbs / 2;
    const allowance = this.allowancePct(fund);
    const overBps = fs.quarterTurnoverBps - allowance * 100;
    const steps = overBps > 0 ? Math.floor(overBps / (REP.turnover.stepPp * 100)) : 0;
    for (let k = fs.excessSteps + 1; k <= steps; k++) {
      const line = allowance + k * REP.turnover.stepPp;
      out.push(
        this.record(fund, "turnover_excess", REP.turnover.delta, at, bell, `${bell}:${k}`,
          `Quarter turnover reached ${pct(fs.quarterTurnoverBps)} of the fund, passing ${line}% (its ${allowance}% allowance + ${k * REP.turnover.stepPp} points).`),
      );
    }
    fs.excessSteps = Math.max(fs.excessSteps, steps);

    const copied = new Set<string>();
    for (const r of this.state.raises) {
      if (r.bell !== bell - 1 || r.fund === fund || copied.has(r.asset)) continue;
      if ((deltas[r.asset] ?? 0) <= 0) continue;
      copied.add(r.asset);
      fs.frontRuns += 1;
      if (fs.frontRuns % REP.frontRunning.perQuarter === 0) {
        out.push(
          this.record(fund, "front_running", REP.frontRunning.delta, at, bell, `${bell}:${r.asset}`,
            `Bought what other funds had just raised at the very next bell ${plural(fs.frontRuns, "time")} this quarter (latest: ${r.asset} after ${this.name(r.fund)} raised it by ${pct(r.delta)}).`),
        );
      }
    }
    for (const [asset, d] of Object.entries(deltas)) {
      if (d >= REP.frontRunning.raiseBps) this.state.raises.push({ bell, fund, asset, delta: d });
    }
    this.state.raises = this.state.raises.filter((r) => r.bell >= bell - 1);

    fs.history.push({ bell, weights: next });
    fs.history = fs.history.filter((h) => h.bell >= bell - REP.flipFlop.withinBells);
    for (const asset of union(...fs.history.map((h) => h.weights))) {
      const from = fs.flipFrom[asset] ?? Number.NEGATIVE_INFINITY;
      const series = fs.history.filter((h) => h.bell >= from).map((h) => ({ bell: h.bell, w: h.weights[asset] ?? 0 }));
      const hit = findRoundTrip(series, REP.flipFlop.moveBps);
      if (!hit) continue;
      fs.flipFrom[asset] = bell;
      if (fs.outsideBps < REP.flipFlop.outsideMinBps) continue;
      out.push(
        this.record(fund, "flip_flop", REP.flipFlop.delta, at, bell, `${bell}:${asset}`,
          `Moved ${asset} from ${pct(hit.start.w)} to ${pct(hit.turn.w)} and back to ${pct(hit.end.w)} within ${plural(hit.end.bell - hit.start.bell, "bell")} while outsiders held ${pct(fs.outsideBps)} of its coins.`),
      );
    }
    for (const asset of Object.keys(fs.flipFrom)) {
      if (fs.flipFrom[asset]! < bell - REP.flipFlop.withinBells) delete fs.flipFrom[asset];
    }

    fs.weights = next;
    fs.cashBps = cash;
    return out;
  }

  private onCrossTrade(input: CrossTradeInput): ReputationChange[] {
    const fs = this.fund(input.fund);
    this.fund(input.target);
    const at = toMs(input.at);
    const window = at - this.config.quarterMs;
    const lots = (fs.lots[input.target] ?? []).filter((l) => l.at >= window);
    const sells = (fs.sells[input.target] ?? []).filter((s) => s.at >= window);
    const out: ReputationChange[] = [];

    if (input.side === "buy") {
      lots.push({ at, usd: input.usd, coins: input.coins, fundValueUsd: input.fundValueUsd });
    } else {
      sells.push({ at, usd: input.usd, coins: input.coins });
      const first = lots[0];
      if (first) {
        const boughtUsd = lots.reduce((s, l) => s + l.usd, 0);
        const boughtCoins = lots.reduce((s, l) => s + l.coins, 0);
        const sold = sells.filter((s) => s.at >= first.at);
        const soldUsd = sold.reduce((s, x) => s + x.usd, 0);
        const soldCoins = sold.reduce((s, x) => s + x.coins, 0);
        const share = first.fundValueUsd > 0 ? boughtUsd / first.fundValueUsd : 0;
        if (boughtCoins > 0 && soldCoins > 0 && share >= REP.pumpDump.minBuyShareOfValue && soldCoins >= REP.pumpDump.minSoldShare * boughtCoins) {
          const avgBuy = boughtUsd / boughtCoins;
          const avgSell = soldUsd / soldCoins;
          if (avgSell > avgBuy) {
            out.push(
              this.record(input.fund, "pump_dump", REP.pumpDump.delta, at, input.bell ?? null, `${input.target}:${input.id ?? at}`,
                `Bought ${usd(boughtUsd)} of ${this.name(input.target)} coins (${pct(share * 10_000)} of its own value) and sold ${ratioPct(Math.min(1, soldCoins / boughtCoins))} of them within a quarter at a profit of ${pct((avgSell / avgBuy - 1) * 10_000)}.`),
            );
            lots.length = 0;
            sells.length = 0;
          }
        }
      }
    }
    if (lots.length) fs.lots[input.target] = lots;
    else delete fs.lots[input.target];
    if (sells.length) fs.sells[input.target] = sells;
    else delete fs.sells[input.target];
    return out;
  }

  private onDeal(input: DealInput): ReputationChange[] {
    const at = toMs(input.at);
    const [a, b] = input.parties;
    const other = (f: FundId) => this.name(f === a ? b : a);
    if (input.outcome === "executed") {
      return input.parties.map((p) =>
        this.record(p, "honoured_deal", REP.honouredDeal, at, input.bell ?? null, input.id, `Honoured its deal with ${other(p)} (${input.id}).`),
      );
    }
    const breakers = [...new Set(input.breakers?.length ? input.breakers : input.parties)].sort();
    return breakers.map((p) =>
      this.record(p, "broken_deal", REP.brokenDeal, at, input.bell ?? null, input.id, `Agreed a deal with ${other(p)} (${input.id}) and let it expire without executing it.`),
    );
  }

  private onPromise(input: PromiseInput): ReputationChange[] {
    const at = toMs(input.at);
    const what = `promised ${signedPct(input.targetBps)}, delivered ${signedPct(input.actualBps)}`;
    return [
      input.kept
        ? this.record(input.fund, "kept_promise", REP.keptPromise, at, null, `s${input.season}`, `Kept its season ${input.season} promise: ${what}.`)
        : this.record(input.fund, "missed_promise", REP.missedPromise, at, null, `s${input.season}`, `Missed its season ${input.season} promise: ${what}.`),
    ];
  }

  private onQuarterClose(input: QuarterCloseInput): ReputationChange[] {
    const at = toMs(input.at);
    const out: ReputationChange[] = [];
    const results = [...input.results].sort((x, y) => (x.fund < y.fund ? -1 : x.fund > y.fund ? 1 : 0));
    for (const r of results) {
      const fs = this.fund(r.fund);
      const allowance = this.allowancePct(r.fund);
      if (fs.quarterTurnoverBps <= allowance * 100 * REP.lowChurn.shareOfAllowance) {
        out.push(
          this.record(r.fund, "low_churn", REP.lowChurn.delta, at, null, `q${input.quarter}`,
            `Calm quarter ${input.quarter}: traded ${pct(fs.quarterTurnoverBps)} of the fund, within half of its ${allowance}% allowance.`),
        );
      }
      if (r.returnBps !== null && input.spyReturnBps !== null && r.returnBps > input.spyReturnBps) {
        out.push(
          this.record(r.fund, "beat_spy", REP.beatSpy, at, null, `q${input.quarter}`,
            `Beat SPY in quarter ${input.quarter}: ${signedPct(r.returnBps)} vs ${signedPct(input.spyReturnBps)}.`),
        );
      }
    }
    for (const fs of Object.values(this.state.funds)) {
      fs.quarterTurnoverBps = 0;
      fs.excessSteps = 0;
      fs.frontRuns = 0;
    }
    return out;
  }
}

interface Point {
  bell: number;
  w: number;
}

export function findRoundTrip(series: Point[], move: number): { start: Point; turn: Point; end: Point } | null {
  const end = series[series.length - 1];
  if (!end || series.length < 3) return null;
  for (let j = series.length - 2; j >= 1; j--) {
    const turn = series[j]!;
    for (let i = 0; i < j; i++) {
      const start = series[i]!;
      const up = turn.w - start.w >= move && turn.w - end.w >= move;
      const down = start.w - turn.w >= move && end.w - turn.w >= move;
      if (up || down) return { start, turn, end };
    }
  }
  return null;
}

export function replay(inputs: Iterable<ReputationInput>, config: Partial<ReputationConfig> = {}) {
  const engine = new ReputationEngine(config);
  const changes = engine.applyAll(inputs);
  return { engine, changes, scores: engine.scores() };
}
