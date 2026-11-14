import type { FundId } from "@listed/shared";
import type { ReputationInput } from "./types";

export interface Nep297 {
  standard: string;
  version?: string;
  event: string;
  data?: unknown;
}

export function parseEventLog(log: string): Nep297 | null {
  if (!log.startsWith("EVENT_JSON:")) return null;
  try {
    const v = JSON.parse(log.slice("EVENT_JSON:".length)) as Nep297;
    return v && typeof v.event === "string" && typeof v.standard === "string" ? v : null;
  } catch {
    return null;
  }
}

export function parseWeightsText(s: string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!s) return out;
  for (const part of s.split(",")) {
    const i = part.lastIndexOf(":");
    if (i <= 0) continue;
    const bps = Number(part.slice(i + 1));
    if (Number.isFinite(bps)) out[part.slice(0, i).trim()] = bps;
  }
  return out;
}

export function scaled(v: unknown, decimals: number): number {
  if (v === null || v === undefined) return 0;
  const s = String(v);
  if (!/^-?\d+$/.test(s)) return Number(s) || 0;
  const b = BigInt(s);
  const unit = 10n ** BigInt(decimals);
  return Number(b / unit) + Number(b % unit) / Number(unit);
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

export class ChainAdapter {
  readonly gameUsdPerNear: number;

  readonly values: Record<FundId, number> = {};

  constructor(opts: { gameUsdPerNear?: number; values?: Record<FundId, number> } = {}) {
    this.gameUsdPerNear = opts.gameUsdPerNear ?? 100;
    Object.assign(this.values, opts.values ?? {});
  }

  toInputs(ev: Nep297, atMs: number): ReputationInput[] {
    if (ev.standard !== "drixie") return [];
    const rows: Row[] = Array.isArray(ev.data) ? (ev.data as Row[]) : ev.data && typeof ev.data === "object" ? [ev.data as Row] : [];
    const out: ReputationInput[] = [];
    for (const d of rows) {
      switch (ev.event) {
        case "fund_created": {
          const fund = String(d.fund);
          if (d.value !== undefined) this.values[fund] = scaled(d.value, 6);
          out.push({ type: "fund_created", fund, at: atMs, weights: parseWeightsText(d.weights as string), cashBps: num(d.cash_bps ?? 0) });
          break;
        }
        case "nav_posted": {
          for (const n of (d.navs as Row[] | undefined) ?? []) if (n.value !== undefined) this.values[String(n.fund)] = scaled(n.value, 6);
          break;
        }
        case "rebalance_revealed":
          out.push({
            type: "rebalance",
            fund: String(d.fund),
            bell: num(d.bell),
            at: atMs,
            weights: parseWeightsText(d.weights as string),
            cashBps: num(d.cash_bps ?? 0),
            ...(d.turnover_bps !== undefined ? { turnoverBps: num(d.turnover_bps) } : {}),
          });
          break;
        case "cross_trade": {
          const fund = String(d.fund);
          out.push({
            type: "cross_trade",
            fund,
            target: String(d.target),
            side: d.side === "sell" ? "sell" : "buy",
            usd: scaled(d.near, 24) * this.gameUsdPerNear,
            coins: scaled(d.coins, 18),
            fundValueUsd: this.values[fund] ?? 0,
            at: atMs,
          });
          break;
        }
        case "promise_settled":
          out.push({
            type: "promise",
            fund: String(d.fund),
            season: num(d.season),
            kept: Boolean(d.kept),
            targetBps: num(d.target_bps),
            actualBps: num(d.return_bps),
            at: atMs,
          });
          break;
        case "quarter_closed":
          out.push({
            type: "quarter_close",
            quarter: num(d.quarter),
            at: atMs,
            spyReturnBps: d.spy_return_bps === null || d.spy_return_bps === undefined ? null : num(d.spy_return_bps),
            results: ((d.funds as Row[] | undefined) ?? []).map((f) => ({
              fund: String(f.fund),
              returnBps: f.return_bps === null || f.return_bps === undefined ? null : num(f.return_bps),
            })),
          });
          break;
        default:
          break;
      }
    }
    return out;
  }
}
