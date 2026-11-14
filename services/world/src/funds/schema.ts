import type { DbHandle } from "@listed/db";

export type Sql = DbHandle["sql"];

export const FUNDS_WORLD_DDL = `
CREATE TABLE IF NOT EXISTS asset_prices (
  asset text NOT NULL,
  ts timestamptz NOT NULL,
  open double precision,
  high double precision,
  low double precision,
  close double precision NOT NULL,
  volume bigint,
  currency text NOT NULL DEFAULT 'USD',
  close_usd double precision NOT NULL,
  fx double precision,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset, ts),
  CONSTRAINT asset_prices_positive CHECK (close > 0 AND close_usd > 0)
);
CREATE INDEX IF NOT EXISTS asset_prices_ts_idx ON asset_prices (ts);

CREATE TABLE IF NOT EXISTS fx_rates (
  pair text NOT NULL,
  ts timestamptz NOT NULL,
  rate double precision NOT NULL,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pair, ts),
  CONSTRAINT fx_rates_positive CHECK (rate > 0)
);

CREATE TABLE IF NOT EXISTS startup_rounds (
  id bigserial PRIMARY KEY,
  asset text NOT NULL,
  round_date date NOT NULL,
  valuation_usd double precision NOT NULL,
  label text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_base boolean NOT NULL DEFAULT false,
  mark_after double precision NOT NULL DEFAULT 100,
  detected_by text NOT NULL DEFAULT 'seed',
  news_id bigint,
  applied_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT startup_rounds_uq UNIQUE (asset, round_date, valuation_usd),
  CONSTRAINT startup_rounds_positive CHECK (valuation_usd > 0)
);
CREATE INDEX IF NOT EXISTS startup_rounds_asset_idx ON startup_rounds (asset, round_date);

CREATE TABLE IF NOT EXISTS startup_marks (
  asset text NOT NULL,
  date date NOT NULL,
  mark double precision NOT NULL,
  prev_mark double precision NOT NULL,
  news_bps integer NOT NULL DEFAULT 0,
  event_bps integer NOT NULL DEFAULT 0,
  sentiment_sum integer NOT NULL DEFAULT 0,
  headlines bigint[] NOT NULL DEFAULT '{}',
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_valuation_usd double precision,
  valuation_usd double precision,
  round_id bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset, date),
  CONSTRAINT startup_marks_positive CHECK (mark > 0 AND prev_mark > 0)
);

CREATE TABLE IF NOT EXISTS asset_bars_1h (
  asset text NOT NULL,
  ts timestamptz NOT NULL,
  open_usd double precision,
  high_usd double precision,
  low_usd double precision,
  close_usd double precision NOT NULL,
  close double precision NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  fx double precision,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset, ts),
  CONSTRAINT asset_bars_1h_positive CHECK (close > 0 AND close_usd > 0)
);
CREATE INDEX IF NOT EXISTS asset_bars_1h_ts_idx ON asset_bars_1h (ts);
`;

let ensured = false;

export async function ensureFundsWorldSchema(sql: Sql): Promise<void> {
  if (ensured) return;

  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('drixie_funds_world_ddl'))`;
    await tx.unsafe(FUNDS_WORLD_DDL);
  });
  ensured = true;
}
