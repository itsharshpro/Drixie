import type { NavPoint } from "@listed/shared";

export interface RaceSeries {
  fund: string;
  points: readonly NavPoint[];
}

export interface RaceStep {
  bell: number;
  t: string;

  rank: Record<string, number>;

  ret: Record<string, number>;
}

export function raceSteps(series: readonly RaceSeries[], maxSteps = 120): RaceStep[] {
  const bells = new Set<number>();
  const at = new Map<string, Map<number, NavPoint>>();
  for (const s of series) {
    const m = new Map<number, NavPoint>();
    for (const p of s.points) {
      m.set(p.bell, p);
      bells.add(p.bell);
    }
    at.set(s.fund, m);
  }
  const ordered = [...bells].sort((a, b) => a - b);
  const last = new Map<string, NavPoint>();
  let prevOrder: string[] = series.map((s) => s.fund);
  const out: RaceStep[] = [];
  for (const bell of ordered) {
    let t = "";
    for (const s of series) {
      const p = at.get(s.fund)?.get(bell);
      if (p) {
        last.set(s.fund, p);
        t ||= p.t;
      }
    }
    const present = series.filter((s) => last.has(s.fund)).map((s) => s.fund);
    if (present.length < 2) continue;
    const prevIdx = new Map(prevOrder.map((f, i) => [f, i]));
    const order = [...present].sort((a, b) => {
      const d = last.get(b)!.ret - last.get(a)!.ret;
      return Math.abs(d) > 1e-9 ? d : (prevIdx.get(a) ?? 99) - (prevIdx.get(b) ?? 99);
    });
    prevOrder = order;
    const rank: Record<string, number> = {};
    const ret: Record<string, number> = {};
    order.forEach((f, i) => {
      rank[f] = i + 1;
      ret[f] = last.get(f)!.ret;
    });
    out.push({ bell, t, rank, ret });
  }
  if (out.length <= maxSteps) return out;

  return [out[0]!, ...out.slice(out.length - maxSteps + 1)];
}

export function overtakes(steps: readonly RaceStep[], fund: string): number {
  let n = 0;
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1]!.rank[fund];
    const b = steps[i]!.rank[fund];
    if (a !== undefined && b !== undefined && b < a) n++;
  }
  return n;
}

export function returnSince(points: readonly NavPoint[], fromMs: number): number | null {
  if (points.length < 2) return null;
  let base: NavPoint | null = null;
  for (const p of points) {
    if (Date.parse(p.t) <= fromMs) base = p;
    else break;
  }
  base ??= points[0]!;
  const last = points[points.length - 1]!;
  if (!(base.nav > 0) || base === last) return null;
  return (last.nav / base.nav - 1) * 100;
}
