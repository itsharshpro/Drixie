import type { FundRiskCaps } from "@listed/shared";

export interface UniverseAsset {
  id: string;

  basket: string;
  kind: "stock" | "startup" | "crypto";
  region: "us" | "india" | "private" | "global";
  name?: string;
}

export interface Rules {
  holdings: number;
  minHoldingBps: number;
  maxHoldingBps: number;
  cashMaxBps: number;
  maxStepBps: number;
  maxSwapsPerBell: number;
  basketCapBps: number;
  startupCapBps: number;
  indiaCapBps: number;

  cryptoCapBps: number;
}

export const DEFAULT_RULES: Omit<Rules, "basketCapBps" | "startupCapBps" | "cryptoCapBps"> = {
  holdings: 10,
  minHoldingBps: 200,
  maxHoldingBps: 2500,
  cashMaxBps: 2000,
  maxStepBps: 1000,
  maxSwapsPerBell: 2,
  indiaCapBps: 3000,
};

export function rulesFrom(caps: Partial<FundRiskCaps> & { startupCapBps: number; basketCapBps: number; cryptoCapBps?: number }): Rules {
  return {
    holdings: 10,
    minHoldingBps: caps.minHoldingBps ?? DEFAULT_RULES.minHoldingBps,
    maxHoldingBps: caps.maxHoldingBps ?? DEFAULT_RULES.maxHoldingBps,
    cashMaxBps: caps.cashMaxBps ?? DEFAULT_RULES.cashMaxBps,
    maxStepBps: caps.maxStepBps ?? DEFAULT_RULES.maxStepBps,
    maxSwapsPerBell: caps.maxSwapsPerBell ?? DEFAULT_RULES.maxSwapsPerBell,
    indiaCapBps: caps.indiaCapBps ?? DEFAULT_RULES.indiaCapBps,
    basketCapBps: caps.basketCapBps,
    startupCapBps: caps.startupCapBps,
    cryptoCapBps: Math.max(0, caps.cryptoCapBps ?? 0),
  };
}

export const isCryptoAsset = (a: UniverseAsset): boolean => a.kind === "crypto" || a.basket === "crypto";

export type Weights = Record<string, number>;

export interface Plan {
  weights: Weights;
  cashBps: number;
}

export function turnoverBps(from: Plan, to: Plan): number {
  const ids = new Set([...Object.keys(from.weights), ...Object.keys(to.weights)]);
  let sum = Math.abs(to.cashBps - from.cashBps);
  for (const id of ids) sum += Math.abs((to.weights[id] ?? 0) - (from.weights[id] ?? 0));
  return Math.round(sum / 2);
}

export function ruleViolations(plan: Plan, current: Plan, universe: ReadonlyMap<string, UniverseAsset>, r: Rules): string[] {
  const out: string[] = [];
  const held = Object.entries(plan.weights).filter(([, b]) => b > 0);
  if (held.length !== r.holdings) out.push(`needs exactly ${r.holdings} holdings (has ${held.length})`);
  let sum = plan.cashBps;
  const basket = new Map<string, number>();
  let startups = 0;
  let india = 0;
  let crypto = 0;
  for (const [id, b] of held) {
    const a = universe.get(id);
    if (!a) {
      out.push(`${id} is not in the universe`);
      continue;
    }
    if (!Number.isInteger(b)) out.push(`${id} weight must be whole bps`);
    if (b < r.minHoldingBps || b > r.maxHoldingBps) out.push(`${id} must be ${r.minHoldingBps}-${r.maxHoldingBps} bps (is ${b})`);
    sum += b;
    basket.set(a.basket, (basket.get(a.basket) ?? 0) + b);
    if (a.basket === "startups") startups += b;
    if (a.region === "india") india += b;
    if (isCryptoAsset(a)) crypto += b;
  }
  if (!Number.isInteger(plan.cashBps) || plan.cashBps < 0 || plan.cashBps > r.cashMaxBps) out.push(`cash must be 0-${r.cashMaxBps} bps (is ${plan.cashBps})`);
  if (sum !== 10_000) out.push(`weights + cash must sum to 10000 (sum ${sum})`);
  for (const [b, w] of basket) if (w > r.basketCapBps) out.push(`basket ${b} is ${w} bps, cap ${r.basketCapBps}`);
  if (startups > r.startupCapBps) out.push(`startups are ${startups} bps, cap ${r.startupCapBps}`);
  if (india > r.indiaCapBps) out.push(`India is ${india} bps, cap ${r.indiaCapBps}`);
  if (crypto > r.cryptoCapBps) out.push(`crypto is ${crypto} bps, cap ${r.cryptoCapBps}`);
  const first = Object.values(current.weights).every((b) => !(b > 0));
  if (!first) {
    const ids = new Set([...Object.keys(current.weights), ...held.map(([id]) => id)]);
    let entered = 0;
    for (const id of ids) {
      const before = current.weights[id] ?? 0;
      const after = plan.weights[id] ?? 0;
      if (Math.abs(after - before) > r.maxStepBps) out.push(`${id} moves ${after - before} bps, max ±${r.maxStepBps} per bell`);
      if (before <= 0 && after > 0) entered++;
    }
    if (entered > r.maxSwapsPerBell) out.push(`${entered} new holdings, max ${r.maxSwapsPerBell} swaps per bell`);
  }
  return out;
}

const groupsOf = (a: UniverseAsset): string[] => {
  const g = [`b:${a.basket}`];
  if (a.basket === "startups") g.push("startup");
  if (a.region === "india") g.push("india");
  if (isCryptoAsset(a)) g.push("crypto");
  return g;
};

export function repairPlan(o: {
  desired: Plan;
  current: Plan;
  universe: ReadonlyMap<string, UniverseAsset>;
  rules: Rules;
  cashFloorBps?: number;

  preference?: (a: UniverseAsset) => number;
}): Plan | null {
  const r = o.rules;
  const uni = o.universe;
  const cur: Weights = {};
  for (const [id, b] of Object.entries(o.current.weights)) if (b > 0 && uni.has(id)) cur[id] = Math.round(b);
  const first = Object.keys(cur).length === 0;

  const allowed = (id: string): boolean => {
    const a = uni.get(id);
    return Boolean(a) && (!isCryptoAsset(a as UniverseAsset) || r.cryptoCapBps >= r.minHoldingBps);
  };
  const want: Weights = {};
  for (const [id, b] of Object.entries(o.desired.weights)) {
    const v = Math.round(Number(b));
    if (allowed(id) && Number.isFinite(v) && v > 0) want[id] = v;
  }
  const floor = Math.min(r.cashMaxBps, Math.max(0, o.cashFloorBps ?? 0));
  let cashWant = Math.round(Number(o.desired.cashBps));
  if (!Number.isFinite(cashWant)) cashWant = floor;
  cashWant = Math.min(r.cashMaxBps, Math.max(floor, cashWant));

  const pref = (id: string) => (o.preference ? o.preference(uni.get(id) as UniverseAsset) : 0);
  const rank = (ids: string[]) => ids.sort((a, b) => (want[b] ?? 0) - (want[a] ?? 0) || pref(b) - pref(a) || a.localeCompare(b));
  const basketOf = (id: string) => (uni.get(id) as UniverseAsset).basket;

  const fill = (set: string[], n: number): string[] => {
    const out = set.slice();
    while (out.length < n) {
      const count = new Map<string, number>();
      for (const id of out) count.set(basketOf(id), (count.get(basketOf(id)) ?? 0) + 1);
      let best: string | null = null;
      let bestScore = -Infinity;
      for (const id of uni.keys()) {
        if (out.includes(id) || !allowed(id)) continue;
        const score = (want[id] ?? 0) / 10_000 + pref(id) - 0.35 * (count.get(basketOf(id)) ?? 0);
        if (score > bestScore || (score === bestScore && best !== null && id < best)) {
          best = id;
          bestScore = score;
        }
      }
      if (!best) break;
      out.push(best);
    }
    return out;
  };

  const capacity = (set: string[]): number => {
    const n = new Map<string, number>();
    for (const id of set) n.set(basketOf(id), (n.get(basketOf(id)) ?? 0) + 1);
    let total = 0;
    for (const [b, k] of n) {
      let c = Math.min(r.basketCapBps, k * r.maxHoldingBps);
      if (b === "startups") c = Math.min(c, r.startupCapBps);
      if (b === "crypto") c = Math.min(c, r.cryptoCapBps);
      const indiaK = set.filter((id) => basketOf(id) === b && (uni.get(id) as UniverseAsset).region === "india").length;
      if (indiaK === k) c = Math.min(c, r.indiaCapBps);
      total += c;
    }
    return total;
  };
  let set: string[];
  if (first) {
    set = fill(rank(Object.keys(want)).slice(0, r.holdings), r.holdings);

    for (let i = 0; i < r.holdings && capacity(set) < 10_000 - r.cashMaxBps; i++) {
      const count = new Map<string, number>();
      for (const id of set) count.set(basketOf(id), (count.get(basketOf(id)) ?? 0) + 1);
      const crowded = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const drop = set.filter((id) => basketOf(id) === crowded).sort((a, b) => (want[a] ?? 0) - (want[b] ?? 0) || pref(a) - pref(b))[0];
      if (!drop) break;
      const rest = set.filter((id) => id !== drop);
      const next = fill(rest.concat(drop), r.holdings + 1).slice(-1)[0];
      if (!next || basketOf(next) === crowded) break;
      set = rest.concat(next);
    }
  } else {
    const curIds = Object.keys(cur);
    const canExit = (id: string) => (cur[id] as number) <= r.maxStepBps;
    const entrants = rank(Object.keys(want).filter((id) => !(id in cur)));

    const exitCands = curIds
      .filter(canExit)
      .sort((a, b) => (want[a] ?? 0) - (want[b] ?? 0) || (cur[a] as number) - (cur[b] as number) || a.localeCompare(b));
    const swaps: [string, string][] = [];
    for (const e of entrants) {
      if (swaps.length >= r.maxSwapsPerBell) break;
      const x = exitCands.find((id) => !swaps.some(([, out]) => out === id));
      if (!x) break;

      if ((want[e] ?? 0) <= (want[x] ?? 0)) break;
      swaps.push([e, x]);
    }
    set = curIds.filter((id) => !swaps.some(([, out]) => out === id)).concat(swaps.map(([e]) => e));
    if (set.length < r.holdings) set = fill(set, r.holdings);
    if (set.length > r.holdings) return null;
  }
  if (set.length !== r.holdings) return null;

  const lo: Weights = {};
  const hi: Weights = {};
  for (const id of set) {
    const c = cur[id] ?? 0;
    lo[id] = first ? r.minHoldingBps : Math.max(r.minHoldingBps, c - r.maxStepBps);
    hi[id] = first ? r.maxHoldingBps : Math.min(r.maxHoldingBps, c + r.maxStepBps);
    if ((lo[id] as number) > (hi[id] as number)) return null;
  }

  if (!first) for (const id of Object.keys(cur)) if (!set.includes(id) && (cur[id] as number) > r.maxStepBps) return null;

  const namedSum = set.reduce((s, id) => s + (want[id] ?? 0), 0);
  const room = 10_000 - cashWant;
  const t: Weights = {};
  for (const id of set) {
    const base = namedSum > 0 ? ((want[id] ?? 0) / namedSum) * room : room / set.length;
    const seeded = want[id] ? base : first ? r.minHoldingBps : (cur[id] ?? r.minHoldingBps);
    t[id] = Math.round(Math.min(hi[id] as number, Math.max(lo[id] as number, seeded)));
  }
  let cash = cashWant;

  const caps = new Map<string, number>([["startup", r.startupCapBps], ["india", r.indiaCapBps], ["crypto", r.cryptoCapBps]]);
  for (const id of set) caps.set(`b:${(uni.get(id) as UniverseAsset).basket}`, r.basketCapBps);
  const groupSum = (g: string) => set.reduce((s, id) => s + (groupsOf(uni.get(id) as UniverseAsset).includes(g) ? (t[id] as number) : 0), 0);
  const slack = (id: string) => Math.min(...groupsOf(uni.get(id) as UniverseAsset).map((g) => (caps.get(g) as number) - groupSum(g)));
  for (let pass = 0; pass < 4; pass++) {
    for (const g of caps.keys()) {
      let excess = groupSum(g) - (caps.get(g) as number);
      if (excess <= 0) continue;
      const members = set.filter((id) => groupsOf(uni.get(id) as UniverseAsset).includes(g));
      while (excess > 0) {
        const movable = members.filter((id) => (t[id] as number) > (lo[id] as number));
        if (!movable.length) return null;
        const total = movable.reduce((s, id) => s + (t[id] as number) - (lo[id] as number), 0);
        let cut = 0;
        for (const id of movable) {
          const share = Math.max(1, Math.floor((((t[id] as number) - (lo[id] as number)) / total) * excess));
          const d = Math.min(share, (t[id] as number) - (lo[id] as number), excess - cut);
          t[id] = (t[id] as number) - d;
          cut += d;
          if (cut >= excess) break;
        }
        excess -= cut;
        if (cut === 0) return null;
      }
    }
  }

  for (let guard = 0; guard < 200; guard++) {
    const diff = 10_000 - cash - set.reduce((s, id) => s + (t[id] as number), 0);
    if (diff === 0) break;
    if (diff > 0) {
      const open = set.filter((id) => (t[id] as number) < (hi[id] as number) && slack(id) > 0);
      if (!open.length) {
        const add = Math.min(diff, r.cashMaxBps - cash);
        if (add <= 0) return null;
        cash += add;
        continue;
      }
      const weight = (id: string) => (want[id] ?? 0) + 1;
      const total = open.reduce((s, id) => s + weight(id), 0);
      let given = 0;
      for (const id of open) {
        const share = Math.max(1, Math.floor((weight(id) / total) * diff));
        const d = Math.min(share, (hi[id] as number) - (t[id] as number), slack(id), diff - given);
        if (d > 0) {
          t[id] = (t[id] as number) + d;
          given += d;
        }
        if (given >= diff) break;
      }
      if (given === 0) {
        const add = Math.min(diff, r.cashMaxBps - cash);
        if (add <= 0) return null;
        cash += add;
      }
    } else {
      const need = -diff;
      const open = set.filter((id) => (t[id] as number) > (lo[id] as number));
      if (!open.length) {
        const cut = Math.min(need, cash - floor);
        if (cut <= 0) return null;
        cash -= cut;
        continue;
      }
      const total = open.reduce((s, id) => s + (t[id] as number) - (lo[id] as number), 0);
      let taken = 0;
      for (const id of open) {
        const share = Math.max(1, Math.floor((((t[id] as number) - (lo[id] as number)) / total) * need));
        const d = Math.min(share, (t[id] as number) - (lo[id] as number), need - taken);
        t[id] = (t[id] as number) - d;
        taken += d;
        if (taken >= need) break;
      }
      if (taken === 0) {
        const cut = Math.min(need, cash - floor);
        if (cut <= 0) return null;
        cash -= cut;
      }
    }
  }
  const plan: Plan = { weights: Object.fromEntries(set.map((id) => [id, t[id] as number])), cashBps: cash };
  return ruleViolations(plan, { weights: cur, cashBps: o.current.cashBps }, uni, r).length ? null : plan;
}
