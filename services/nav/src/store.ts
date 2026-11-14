import type { DbHandle } from "@listed/db";
import { BENCHMARK, startupMark, STARTUP_IDS, UNIVERSE } from "@listed/fundmath";
import type { WeightEntry } from "@listed/shared";
import type { FundSnapshot } from "./engine";

export type Sql = DbHandle["sql"];

const NAV_DDL = `
CREATE TABLE IF NOT EXISTS nav_bells (
  clock text NOT NULL,
  bell bigint NOT NULL,
  bell_at timestamptz NOT NULL,
  prices_hash text NOT NULL,
  prices jsonb NOT NULL,
  missing text[] NOT NULL DEFAULT '{}',
  stale text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'snapshot',
  tx_hash text,
  error text,
  filled integer,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clock, bell)
);
CREATE TABLE IF NOT EXISTS nav_fund_bells (
  clock text NOT NULL,
  bell bigint NOT NULL,
  fund text NOT NULL,
  value_prev_usd double precision NOT NULL,
  portfolio_return double precision NOT NULL,
  cross_prev_usd double precision NOT NULL DEFAULT 0,
  cross_now_usd double precision NOT NULL DEFAULT 0,
  cross_flow_usd double precision NOT NULL DEFAULT 0,
  turnover_bps double precision NOT NULL DEFAULT 0,
  trading_cost_usd double precision NOT NULL DEFAULT 0,
  brain_bill_usd double precision NOT NULL DEFAULT 0,
  mgmt_fee_usd double precision NOT NULL DEFAULT 0,
  value_usd double precision NOT NULL,
  nav_usd double precision NOT NULL,
  value_micro text NOT NULL,
  nav_micro text NOT NULL,
  missing text[] NOT NULL DEFAULT '{}',
  skipped text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clock, bell, fund)
);
CREATE TABLE IF NOT EXISTS nav_fund_state (
  clock text NOT NULL,
  fund text NOT NULL,
  bell bigint NOT NULL,
  value_micro text NOT NULL,
  vault text NOT NULL,
  cross_micro text NOT NULL,
  turnover_q integer NOT NULL,
  weights jsonb NOT NULL,
  cash_bps integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clock, fund)
);
CREATE TABLE IF NOT EXISTS nav_quarters (
  clock text NOT NULL,
  kind text NOT NULL,
  ref bigint NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  tx_hash text,
  error text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clock, kind, ref)
);
CREATE TABLE IF NOT EXISTS nav_badges (
  contract text NOT NULL,
  kind text NOT NULL,
  fund text NOT NULL DEFAULT '',
  season bigint NOT NULL DEFAULT -1,
  account text NOT NULL,
  token_id text,
  tx_hash text,
  status text NOT NULL DEFAULT 'minted',
  error text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract, kind, fund, season, account)
);
CREATE TABLE IF NOT EXISTS nav_black_swans (
  id bigserial PRIMARY KEY,
  clock text NOT NULL,
  quarter bigint NOT NULL,
  kind text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  seed text NOT NULL,
  applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nav_black_swans_uq UNIQUE (clock, quarter)
);
`;

export async function ensureNavSchema(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('drixie_nav_ddl'))`;
    await tx.unsafe(NAV_DDL);
  });
}

const iso = (d: Date | number): string => new Date(d).toISOString();
const isoDay = (d: Date | number): string => new Date(d).toISOString().slice(0, 10);

export interface PriceSnapshot {
  prices: Record<string, number>;

  missing: string[];

  stale: string[];
}

export async function readPrices(sql: Sql, at: Date): Promise<PriceSnapshot> {
  const prices: Record<string, number> = {};
  const stale: string[] = [];
  try {
    const rows = await sql<{ asset: string; ts: string; close_usd: number }[]>`
      SELECT DISTINCT ON (asset) asset, ts, close_usd FROM asset_prices
      WHERE ts < ${iso(at)} AND ts >= ${iso(at.getTime() - 14 * 86_400_000)}
      ORDER BY asset, ts DESC`;
    for (const r of rows) {
      prices[r.asset] = Number(r.close_usd);
      if (Date.parse(String(r.ts)) < at.getTime() - 4 * 86_400_000) stale.push(r.asset);
    }
    const marks = await sql<{ asset: string; mark: number }[]>`
      SELECT DISTINCT ON (asset) asset, mark FROM startup_marks WHERE date <= ${isoDay(at)} ORDER BY asset, date DESC`;
    for (const m of marks) prices[m.asset] = Number(m.mark);
  } catch (err) {

    if (!/does not exist/i.test(err instanceof Error ? err.message : String(err))) throw err;
  }
  const want = [...UNIVERSE.map((a) => a.id), BENCHMARK.id];
  const known = new Set(want);
  for (const k of Object.keys(prices)) if (!known.has(k)) delete prices[k];
  return { prices, missing: want.filter((id) => !(id in prices)), stale };
}

export async function saveBellSnapshot(sql: Sql, clock: string, bell: number, bellAt: Date, pricesHash: string, snap: PriceSnapshot): Promise<void> {
  await sql`
    INSERT INTO nav_bells (clock, bell, bell_at, prices_hash, prices, missing, stale, status)
    VALUES (${clock}, ${bell}, ${iso(bellAt)}, ${pricesHash}, ${JSON.stringify(snap.prices)}::jsonb, ${`{${snap.missing.map((m) => `"${m}"`).join(",")}}`}::text[],
      ${`{${snap.stale.map((m) => `"${m}"`).join(",")}}`}::text[], 'snapshot')
    ON CONFLICT (clock, bell) DO NOTHING`;
}

export interface BellRow {
  clock: string;
  bell: number;
  bellAt: string;
  pricesHash: string;
  prices: Record<string, number>;
  missing: string[];
  stale: string[];
  status: string;
  txHash: string | null;
  error: string | null;
  filled: number | null;
  postedAt: string | null;
}

const toBell = (r: Record<string, unknown>): BellRow => ({
  clock: String(r.clock),
  bell: Number(r.bell),
  bellAt: new Date(String(r.bell_at)).toISOString(),
  pricesHash: String(r.prices_hash),
  prices: (typeof r.prices === "string" ? JSON.parse(r.prices) : r.prices) as Record<string, number>,
  missing: (r.missing as string[]) ?? [],
  stale: (r.stale as string[]) ?? [],
  status: String(r.status),
  txHash: (r.tx_hash as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  filled: r.filled === null || r.filled === undefined ? null : Number(r.filled),
  postedAt: r.posted_at ? new Date(String(r.posted_at)).toISOString() : null,
});

export async function getBell(sql: Sql, clock: string, bell: number): Promise<BellRow | null> {
  const [r] = await sql`SELECT * FROM nav_bells WHERE clock = ${clock} AND bell = ${bell}`;
  return r ? toBell(r) : null;
}

export async function latestBells(sql: Sql, clock: string | null, limit: number): Promise<BellRow[]> {
  const rows = clock
    ? await sql`SELECT * FROM nav_bells WHERE clock = ${clock} ORDER BY bell DESC LIMIT ${limit}`
    : await sql`SELECT * FROM nav_bells ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(toBell);
}

export async function markBell(sql: Sql, clock: string, bell: number, patch: { status: string; txHash?: string | null; error?: string | null; filled?: number | null }): Promise<void> {
  await sql`
    UPDATE nav_bells SET status = ${patch.status}, tx_hash = ${patch.txHash ?? null}, error = ${patch.error ?? null},
      filled = ${patch.filled ?? null}, posted_at = ${patch.status === "posted" ? iso(Date.now()) : null}
    WHERE clock = ${clock} AND bell = ${bell}`;
}

export interface FundBellRow {
  fund: string;
  valuePrev: number;
  portfolioReturn: number;
  crossPrev: number;
  crossNow: number;
  crossFlow: number;
  turnoverBps: number;
  tradingCost: number;
  brainBill: number;
  mgmtFee: number;
  value: number;
  nav: number;
  valueMicro: string;
  navMicro: string;
  missing: string[];
  skipped: string | null;
}

export async function saveFundBells(sql: Sql, clock: string, bell: number, rows: FundBellRow[]): Promise<void> {
  for (const r of rows) {
    await sql`
      INSERT INTO nav_fund_bells (clock, bell, fund, value_prev_usd, portfolio_return, cross_prev_usd, cross_now_usd, cross_flow_usd,
        turnover_bps, trading_cost_usd, brain_bill_usd, mgmt_fee_usd, value_usd, nav_usd, value_micro, nav_micro, missing, skipped)
      VALUES (${clock}, ${bell}, ${r.fund}, ${r.valuePrev}, ${r.portfolioReturn}, ${r.crossPrev}, ${r.crossNow}, ${r.crossFlow},
        ${r.turnoverBps}, ${r.tradingCost}, ${r.brainBill}, ${r.mgmtFee}, ${r.value}, ${r.nav}, ${r.valueMicro}, ${r.navMicro},
        ${`{${r.missing.map((m) => `"${m}"`).join(",")}}`}::text[], ${r.skipped})
      ON CONFLICT (clock, bell, fund) DO UPDATE SET value_prev_usd = excluded.value_prev_usd, portfolio_return = excluded.portfolio_return,
        cross_prev_usd = excluded.cross_prev_usd, cross_now_usd = excluded.cross_now_usd, cross_flow_usd = excluded.cross_flow_usd,
        turnover_bps = excluded.turnover_bps, trading_cost_usd = excluded.trading_cost_usd, brain_bill_usd = excluded.brain_bill_usd,
        mgmt_fee_usd = excluded.mgmt_fee_usd, value_usd = excluded.value_usd, nav_usd = excluded.nav_usd, value_micro = excluded.value_micro,
        nav_micro = excluded.nav_micro, missing = excluded.missing, skipped = excluded.skipped`;
  }
}

export async function loadSnapshots(sql: Sql, clock: string): Promise<Map<string, FundSnapshot>> {
  const rows = await sql<{ fund: string; bell: string; value_micro: string; vault: string; cross_micro: string; turnover_q: number; weights: unknown; cash_bps: number }[]>`
    SELECT fund, bell::text, value_micro, vault, cross_micro, turnover_q, weights, cash_bps FROM nav_fund_state WHERE clock = ${clock}`;
  return new Map(
    rows.map((r) => [
      r.fund,
      {
        bell: Number(r.bell),
        value: BigInt(r.value_micro),
        vault: BigInt(r.vault),
        crossValue: BigInt(r.cross_micro),
        turnoverQuarterBps: Number(r.turnover_q),
        weights: (typeof r.weights === "string" ? JSON.parse(r.weights) : r.weights) as WeightEntry[],
        cashBps: Number(r.cash_bps),
      },
    ]),
  );
}

export async function saveSnapshots(sql: Sql, clock: string, snaps: FundSnapshot[], funds: string[]): Promise<void> {
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i] as FundSnapshot;
    const fund = funds[i] as string;
    await sql`
      INSERT INTO nav_fund_state (clock, fund, bell, value_micro, vault, cross_micro, turnover_q, weights, cash_bps, updated_at)
      VALUES (${clock}, ${fund}, ${s.bell}, ${s.value.toString()}, ${s.vault.toString()}, ${s.crossValue.toString()}, ${s.turnoverQuarterBps},
        ${JSON.stringify(s.weights)}::jsonb, ${s.cashBps}, now())
      ON CONFLICT (clock, fund) DO UPDATE SET bell = excluded.bell, value_micro = excluded.value_micro, vault = excluded.vault,
        cross_micro = excluded.cross_micro, turnover_q = excluded.turnover_q, weights = excluded.weights, cash_bps = excluded.cash_bps, updated_at = now()`;
  }
}

export async function aiCostByFund(sql: Sql, funds: string[], from: Date, to: Date): Promise<Record<string, number>> {
  if (funds.length === 0) return {};
  const rows = await sql<{ company: string; cost: number }[]>`
    SELECT lower(company) AS company, COALESCE(sum(cost_usd), 0)::float8 AS cost FROM ai_usage
    WHERE service = 'agents' AND lower(company) = ANY(${`{${funds.map((f) => `"${f.toLowerCase()}"`).join(",")}}`}::text[]) AND at > ${iso(from)} AND at <= ${iso(to)}
    GROUP BY lower(company)`;

  return Object.fromEntries(rows.map((r) => [r.company, Number(r.cost)]));
}

export async function recordQuarterCall(sql: Sql, clock: string, kind: "quarter" | "season" | "anchor" | "dna", ref: number, status: string, detail: Record<string, unknown>, txHash: string | null, error: string | null): Promise<void> {
  await sql`
    INSERT INTO nav_quarters (clock, kind, ref, detail, status, tx_hash, error)
    VALUES (${clock}, ${kind}, ${ref}, ${JSON.stringify(detail)}::jsonb, ${status}, ${txHash}, ${error})
    ON CONFLICT (clock, kind, ref) DO UPDATE SET detail = excluded.detail, status = excluded.status, tx_hash = excluded.tx_hash, error = excluded.error, at = now()`;
}

export async function spyAt(sql: Sql, at: Date): Promise<number | null> {
  try {
    const [r] = await sql<{ close_usd: number }[]>`
      SELECT close_usd FROM asset_prices WHERE asset = ${BENCHMARK.id} AND ts <= ${iso(at)} ORDER BY ts DESC LIMIT 1`;
    if (r) return Number(r.close_usd);
    const [d] = await sql<{ close: number }[]>`
      SELECT close FROM world_prices WHERE symbol = ${BENCHMARK.id} AND date <= ${isoDay(at)} ORDER BY date DESC LIMIT 1`;
    return d ? Number(d.close) : null;
  } catch {
    return null;
  }
}

export interface BlackSwanRow {
  id: number;
  clock: string;
  quarter: number;
  kind: string;
  startsAt: string;
  endsAt: string;
  seed: string;
  applied: Record<string, unknown>;
}

const toSwan = (r: Record<string, unknown>): BlackSwanRow => ({
  id: Number(r.id),
  clock: String(r.clock),
  quarter: Number(r.quarter),
  kind: String(r.kind),
  startsAt: new Date(String(r.starts_at)).toISOString(),
  endsAt: new Date(String(r.ends_at)).toISOString(),
  seed: String(r.seed),
  applied: (typeof r.applied === "string" ? JSON.parse(r.applied) : r.applied) as Record<string, unknown>,
});

export async function insertBlackSwan(sql: Sql, s: { clock: string; quarter: number; kind: string; startsAt: Date; endsAt: Date; seed: string }): Promise<BlackSwanRow | null> {
  const [r] = await sql`
    INSERT INTO nav_black_swans (clock, quarter, kind, starts_at, ends_at, seed)
    VALUES (${s.clock}, ${s.quarter}, ${s.kind}, ${iso(s.startsAt)}, ${iso(s.endsAt)}, ${s.seed})
    ON CONFLICT ON CONSTRAINT nav_black_swans_uq DO NOTHING RETURNING *`;
  return r ? toSwan(r) : null;
}

export async function swanForQuarter(sql: Sql, clock: string, quarter: number): Promise<BlackSwanRow | null> {
  const [r] = await sql`SELECT * FROM nav_black_swans WHERE clock = ${clock} AND quarter = ${quarter}`;
  return r ? toSwan(r) : null;
}

export async function activeSwans(sql: Sql, at: Date): Promise<BlackSwanRow[]> {
  const rows = await sql`SELECT * FROM nav_black_swans WHERE starts_at <= ${iso(at)} AND ends_at > ${iso(at)} ORDER BY starts_at DESC`;
  return rows.map(toSwan);
}

export async function recentSwans(sql: Sql, limit: number): Promise<BlackSwanRow[]> {
  const rows = await sql`SELECT * FROM nav_black_swans ORDER BY starts_at DESC LIMIT ${limit}`;
  return rows.map(toSwan);
}

export async function markSwanApplied(sql: Sql, id: number, applied: Record<string, unknown>): Promise<void> {
  await sql`UPDATE nav_black_swans SET applied = ${JSON.stringify(applied)}::jsonb WHERE id = ${id}`;
}

export async function applyStartupEvent(sql: Sql, day: string, bps: number, ref: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const event = JSON.stringify([{ kind: "black_swan", bps, ref, at: new Date().toISOString() }]);
  for (const asset of STARTUP_IDS) {
    const [prev] = await sql<{ mark: number }[]>`SELECT mark FROM startup_marks WHERE asset = ${asset} AND date < ${day} ORDER BY date DESC LIMIT 1`;
    const prevMark = prev ? Number(prev.mark) : 100;
    const [row] = await sql<{ mark: number }[]>`
      INSERT INTO startup_marks (asset, date, mark, prev_mark, news_bps, event_bps, events, updated_at)
      VALUES (${asset}, ${day}, ${startupMark(prevMark, 0, bps)}, ${prevMark}, 0, ${bps}, ${event}::jsonb, now())
      ON CONFLICT (asset, date) DO UPDATE SET
        event_bps = startup_marks.event_bps + ${bps},
        events = startup_marks.events || ${event}::jsonb,
        mark = GREATEST(0.0001, round((startup_marks.prev_mark * (1 + startup_marks.news_bps::float8 / 10000) * (1 + (startup_marks.event_bps + ${bps})::float8 / 10000))::numeric, 4))::float8,
        valuation_usd = CASE WHEN startup_marks.base_valuation_usd IS NULL THEN NULL ELSE startup_marks.base_valuation_usd *
          GREATEST(0.0001, round((startup_marks.prev_mark * (1 + startup_marks.news_bps::float8 / 10000) * (1 + (startup_marks.event_bps + ${bps})::float8 / 10000))::numeric, 4))::float8 / 100 END,
        updated_at = now()
      RETURNING mark`;
    if (row) out[asset] = Number(row.mark);
  }
  return out;
}

export interface BadgeTarget {
  kind: "early_backer" | "season_winner_backer" | "black_swan_holder";
  fund: string;
  season: number | null;
  account: string;
}

export async function badgesDone(sql: Sql, contract: string): Promise<Set<string>> {
  const rows = await sql<{ kind: string; fund: string; season: number; account: string }[]>`
    SELECT kind, fund, season::int AS season, account FROM nav_badges WHERE contract = ${contract}`;
  return new Set(rows.map((r) => badgeKey({ kind: r.kind as BadgeTarget["kind"], fund: r.fund, season: r.season < 0 ? null : r.season, account: r.account })));
}

export function badgeKey(t: BadgeTarget): string {
  return `${t.kind}|${t.fund}|${t.season ?? -1}|${t.account}`;
}

export async function recordBadge(sql: Sql, contract: string, t: BadgeTarget, r: { tokenId: string | null; txHash: string | null; status: string; error: string | null }): Promise<void> {
  await sql`
    INSERT INTO nav_badges (contract, kind, fund, season, account, token_id, tx_hash, status, error)
    VALUES (${contract}, ${t.kind}, ${t.fund}, ${t.season ?? -1}, ${t.account}, ${r.tokenId}, ${r.txHash}, ${r.status}, ${r.error})
    ON CONFLICT (contract, kind, fund, season, account) DO UPDATE SET token_id = excluded.token_id, tx_hash = excluded.tx_hash,
      status = excluded.status, error = excluded.error, at = now()`;
}

async function indexerTable(sql: Sql, name: string): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`SELECT to_regclass(${`public.${name}`}) IS NOT NULL AS ok`;
  return Boolean(r?.ok);
}

export async function earlyBackers(sql: Sql, exclude: (account: string) => boolean): Promise<{ fund: string; account: string }[]> {
  if (!(await indexerTable(sql, "fund_orders"))) return [];
  const rows = await sql<{ fund: string; account: string }[]>`
    SELECT fund, account FROM (
      SELECT fund, account, min(filled_at) AS first FROM fund_orders
      WHERE side = 'subscribe' AND status = 'filled' AND filled_at IS NOT NULL GROUP BY fund, account
    ) t ORDER BY fund, first`;
  const out: { fund: string; account: string }[] = [];
  const perFund = new Map<string, number>();
  for (const r of rows) {
    if (exclude(r.account)) continue;
    const n = perFund.get(r.fund) ?? 0;
    if (n >= 100) continue;
    perFund.set(r.fund, n + 1);
    out.push(r);
  }
  return out;
}

export async function holdersOf(sql: Sql, fund: string | null, since: Date | null, exclude: (account: string) => boolean): Promise<{ fund: string; account: string }[]> {
  if (!(await indexerTable(sql, "fund_balances"))) return [];
  const rows = await sql<{ fund: string; account: string; first_at: string | null }[]>`
    SELECT fund, account, first_at::text AS first_at FROM fund_balances
    WHERE coins::numeric > 0 ${fund ? sql`AND fund = ${fund}` : sql``} ORDER BY fund, account`;
  return rows
    .filter((r) => !exclude(r.account))
    .filter((r) => !since || (r.first_at !== null && Date.parse(r.first_at) <= since.getTime()))
    .map((r) => ({ fund: r.fund, account: r.account }));
}

export async function reputationAnchor(sql: Sql): Promise<{ quarter: number; root: string; scores: { fund: string; score: number }[]; quarterClosed: number | null } | null> {
  if (!(await indexerTable(sql, "fund_state"))) return null;
  const [r] = await sql<{ value: unknown }[]>`SELECT value FROM fund_state WHERE key = 'reputation_anchor'`;
  const v = (typeof r?.value === "string" ? JSON.parse(r.value) : r?.value) as
    | { quarter?: number; root?: string; scores?: { fund: string; score: number }[]; quarterClosed?: number | null }
    | undefined;
  if (!v || typeof v.root !== "string" || !Array.isArray(v.scores)) return null;
  return { quarter: Number(v.quarter ?? 0), root: v.root, scores: v.scores, quarterClosed: v.quarterClosed ?? null };
}

export async function closedSwans(sql: Sql, clock: string, lastClosedQuarter: number): Promise<BlackSwanRow[]> {
  const rows = await sql`SELECT * FROM nav_black_swans WHERE clock = ${clock} AND quarter <= ${lastClosedQuarter} ORDER BY quarter`;
  return rows.map(toSwan);
}
