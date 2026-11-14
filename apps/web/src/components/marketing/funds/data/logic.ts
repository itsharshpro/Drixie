import { FUND_COLORS, FUND_IDS, FUND_SEEDS, type FundRow, type Move, type NavPoint, type SeedFundId } from "@listed/shared";

const PASTEL: Record<SeedFundId, string> = { atlas: "sky", meridian: "mint", nova: "lavender", orion: "lime", kite: "pink" };

export function isSeedFund(id: string): id is SeedFundId {
  return (FUND_IDS as readonly string[]).includes(id);
}

export function fundColor(id: string): string {
  return isSeedFund(id) ? `var(--viz-${FUND_COLORS[id]})` : "var(--viz-slate)";
}

export function fundPastel(id: string): string {
  return isSeedFund(id) ? `var(--${PASTEL[id]})` : "var(--fill)";
}

export function fundName(id: string): string {
  return isSeedFund(id) ? FUND_SEEDS[id].name : id.charAt(0).toUpperCase() + id.slice(1);
}

export function mandateWord(mandate: string): string {
  return mandate ? mandate.charAt(0).toUpperCase() + mandate.slice(1) : "";
}

export function orderFunds(rows: readonly FundRow[]): FundRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seeded = FUND_IDS.map((id) => byId.get(id)).filter((r): r is FundRow => !!r);
  const extra = rows.filter((r) => !isSeedFund(r.id) && r.status !== "liquidated");
  return [...seeded, ...extra];
}

export function fmtUsd(v: number | null | undefined, opts: { digits?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = opts.digits ?? (abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${v < 0 ? "−" : ""}$${s}`;
}

export function fmtUsdCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}$${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}$${trim(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function trim(n: number): string {
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const r = Number(v.toFixed(digits));
  if (r === 0) return `${(0).toFixed(digits)}%`;
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(digits)}%`;
}

export function fmtPp(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const r = Number(v.toFixed(1));
  if (r === 0) return "0.0 pp";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)} pp`;
}

export function tone(v: number | null | undefined): "up" | "down" | "flat" {
  if (v === null || v === undefined || !Number.isFinite(v)) return "flat";
  const r = Number(v.toFixed(1));
  return r > 0 ? "up" : r < 0 ? "down" : "flat";
}

export function fmtBps(bps: number): string {
  const p = bps / 100;
  return `${Number.isInteger(p) ? p.toFixed(0) : p.toFixed(1)}%`;
}

export function secondsUntil(iso: string | null | undefined, now: number | null): number | null {
  if (!iso || now === null) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((t - now) / 1000));
}

export function fmtCountdown(secs: number | null): string {
  if (secs === null) return "--:--";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm.padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function fmtAgo(iso: string | null | undefined, now: number | null): string {
  if (!iso || now === null) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function brainLabel(tier: string | null | undefined): string {
  if (tier === "best") return "Top brain";
  if (tier === "primary") return "Mid brain";
  if (tier === "small") return "Small brain";
  return "Brain";
}

export function tierForValue(usd: number): "best" | "primary" | "small" {
  return usd >= 3_000_000 ? "best" : usd >= 1_000_000 ? "primary" : "small";
}

export function repTone(score: number | null | undefined): "red" | "amber" | "green" | "none" {
  if (score === null || score === undefined || !Number.isFinite(score)) return "none";
  return score < 40 ? "red" : score < 60 ? "amber" : "green";
}

export interface XY {
  x: number;
  y: number;
}

export interface LineSeries {
  id: string;

  points: { t: number; v: number }[];
}

export function navToSeries(id: string, points: readonly NavPoint[]): { fund: LineSeries; spy: LineSeries } {
  const fund: LineSeries = { id, points: [] };
  const spy: LineSeries = { id: "SPY", points: [] };
  for (const p of points) {
    const t = Date.parse(p.t);
    if (!Number.isFinite(t)) continue;
    if (Number.isFinite(p.ret)) fund.points.push({ t, v: p.ret });
    if (p.spy !== null && Number.isFinite(p.spy)) spy.points.push({ t, v: p.spy });
  }
  return { fund, spy };
}

export function domainOf(series: readonly LineSeries[]): { t0: number; t1: number; v0: number; v1: number } | null {
  let t0 = Infinity;
  let t1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const s of series)
    for (const p of s.points) {
      if (p.t < t0) t0 = p.t;
      if (p.t > t1) t1 = p.t;
      if (p.v < v0) v0 = p.v;
      if (p.v > v1) v1 = p.v;
    }
  if (!Number.isFinite(t0) || !Number.isFinite(v0)) return null;
  if (t1 === t0) t1 = t0 + 1;
  const span = v1 - v0;
  const pad = span < 0.2 ? Math.max(0.1, (0.2 - span) / 2 + 0.05) : span * 0.12;
  return { t0, t1, v0: v0 - pad, v1: v1 + pad };
}

export function linePath(s: LineSeries, d: { t0: number; t1: number; v0: number; v1: number }, w: number, h: number): string {
  if (!s.points.length) return "";
  const sx = (t: number) => ((t - d.t0) / (d.t1 - d.t0)) * w;
  const sy = (v: number) => h - ((v - d.v0) / (d.v1 - d.v0)) * h;
  if (s.points.length === 1) {
    const y = sy(s.points[0]!.v);
    return `M0 ${y.toFixed(1)}L${w} ${y.toFixed(1)}`;
  }
  return s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.t).toFixed(1)} ${sy(p.v).toFixed(1)}`).join("");
}

export function sparkPath(values: readonly number[], w: number, h: number, pad = 2): string {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return "";
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  return v
    .map((x, i) => {
      const px = (i / (v.length - 1)) * w;
      const py = pad + (1 - (x - lo) / (hi - lo)) * (h - pad * 2);
      return `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join("");
}

export interface Arc {
  key: string;
  bps: number;
  d: string;
}

export function donutArcs(slices: readonly { key: string; bps: number }[], r: number, inner: number, gapDeg = 1.4): Arc[] {
  const total = slices.reduce((s, x) => s + Math.max(0, x.bps), 0);
  if (total <= 0) return [];
  const out: Arc[] = [];
  let a = -90;
  for (const sl of slices) {
    if (sl.bps <= 0) continue;
    const sweep = (sl.bps / total) * 360;
    const a0 = a + gapDeg / 2;
    const a1 = a + Math.max(gapDeg / 2 + 0.5, sweep - gapDeg / 2);
    out.push({ key: sl.key, bps: sl.bps, d: arcPath(r, inner, a0, a1) });
    a += sweep;
  }
  return out;
}

function arcPath(r: number, inner: number, a0: number, a1: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const p = (rr: number, d: number) => `${(rr * Math.cos(rad(d))).toFixed(2)} ${(rr * Math.sin(rad(d))).toFixed(2)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(r, a0)}A${r} ${r} 0 ${large} 1 ${p(r, a1)}L${p(inner, a1)}A${inner} ${inner} 0 ${large} 0 ${p(inner, a0)}Z`;
}

export function newestMove(moves: readonly (Move | null | undefined)[]): Move | null {
  let best: Move | null = null;
  for (const m of moves) {
    if (!m) continue;
    if (!best || Date.parse(m.at) > Date.parse(best.at)) best = m;
  }
  return best;
}

export function headlineDiffs(move: Move, n = 3): Move["diffs"] {
  return move.diffs
    .filter((d) => d.kind !== "same" && d.delta !== 0)
    .sort((a, b) => {
      const rank = (k: string) => (k === "enter" || k === "exit" ? 0 : 1);
      return rank(a.kind) - rank(b.kind) || Math.abs(b.delta) - Math.abs(a.delta);
    })
    .slice(0, n);
}

export function diffLabel(d: Move["diffs"][number]): string {
  if (d.kind === "enter") return `New ${d.asset} ${fmtBps(d.after)}`;
  if (d.kind === "exit") return `Sold ${d.asset}`;
  return `${d.delta > 0 ? "+" : "−"}${d.asset} ${fmtBps(Math.abs(d.delta))}`;
}

export interface StoryStep {
  label: string;
  delta: number;
  score: number;
}

export const REPUTATION_RULES = {
  start: 60,
  flipFlop: -3,
  frontRunning: -5,
  pumpDump: -15,
  turnoverPer5pp: -1,
  noBuyBelow: 40,
  exitLoadWaivedBelow: 25,
} as const;

export function manipulationStory(): StoryStep[] {
  const R = REPUTATION_RULES;
  const steps: [string, number][] = [
    ["Flip-flop", R.flipFlop],
    ["Flip-flop", R.flipFlop],
    ["Front-running", R.frontRunning],
    ["Flip-flop", R.flipFlop],
    ["Pump & dump", R.pumpDump],
    ["Flip-flop", R.flipFlop],
    ["Churn +20 pp", R.turnoverPer5pp * 4],
  ];
  const out: StoryStep[] = [];
  let s: number = R.start;
  for (const [label, delta] of steps) {
    s = Math.max(0, Math.min(100, s + delta));
    out.push({ label, delta, score: s });
  }
  return out;
}

export type BacktestInterval = "1h" | "1d";
export const BACKTEST_INTERVALS: readonly BacktestInterval[] = ["1h", "1d"];

export const LIVE_MIN_POINTS = 30;
export const BACKTEST_LABEL = "Backtest · real prices since Nov 1";

export interface BacktestCandle {
  t: number | string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface FundBacktest {
  from: string;
  interval: BacktestInterval;
  candles: BacktestCandle[];
  spy: { t: number | string; v: number }[];
  weightsSource: "on-chain" | "mandate-default";
  label: string;
}

const toMs = (t: number | string): number => (typeof t === "number" ? t : Date.parse(t));

export interface PlainCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function backtestCandles(bt: FundBacktest | null | undefined): PlainCandle[] {
  if (!bt?.candles?.length) return [];
  const out: PlainCandle[] = [];
  for (const c of bt.candles) {
    const ms = toMs(c.t);
    if (!Number.isFinite(ms) || ![c.o, c.h, c.l, c.c].every((v) => Number.isFinite(v) && v > 0)) continue;
    out.push({ time: Math.floor(ms / 1000), open: c.o, high: Math.max(c.h, c.o, c.c), low: Math.min(c.l, c.o, c.c), close: c.c, volume: 0 });
  }
  return out.sort((a, b) => a.time - b.time);
}

export function backtestSpy(bt: FundBacktest | null | undefined): { t: number; v: number }[] {
  if (!bt?.spy?.length) return [];
  return bt.spy
    .map((p) => ({ t: Math.floor(toMs(p.t) / 1000), v: p.v }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0)
    .sort((a, b) => a.t - b.t);
}

export function backtestReturn(bt: FundBacktest | null | undefined): number | null {
  const cs = backtestCandles(bt);
  const first = cs[0];
  const last = cs[cs.length - 1];
  if (!first || !last || !(first.open > 0)) return null;
  return (last.close / first.open - 1) * 100;
}

export function downsample(values: readonly number[], n: number): number[] {
  if (values.length <= n || n < 2) return [...values];
  const out: number[] = [];
  const step = (values.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(values[Math.round(i * step)]!);
  return out;
}

export function backtestSpark(bt: FundBacktest | null | undefined, n = 48): number[] {
  const cs = backtestCandles(bt);
  if (!cs.length) return [];
  return downsample([cs[0]!.open, ...cs.map((c) => c.close)], n);
}

export function liveTooThin(values: readonly number[] | null | undefined, min = LIVE_MIN_POINTS, flatRel = 5e-4): boolean {
  const v = (values ?? []).filter((x) => Number.isFinite(x));
  if (v.length < min) return true;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return hi - lo <= Math.abs(hi) * flatRel;
}
