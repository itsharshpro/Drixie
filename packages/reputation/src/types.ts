import type { FundId, ReputationEventKind, WeightEntry } from "@listed/shared";

export type Instant = number | string;

export type Weights = WeightEntry[] | Record<string, number>;

export interface RebalanceInput {
  type: "rebalance";
  fund: FundId;
  bell: number;
  at: Instant;
  weights: Weights;
  cashBps: number;

  outsideBps?: number;

  turnoverBps?: number;
}

export interface FundCreatedInput {
  type: "fund_created";
  fund: FundId;
  at: Instant;
  weights: Weights;
  cashBps: number;
}

export interface HoldersInput {
  type: "holders";
  fund: FundId;
  at: Instant;
  outsideBps: number;
}

export interface CrossTradeInput {
  type: "cross_trade";
  fund: FundId;
  target: FundId;
  side: "buy" | "sell";

  usd: number;

  coins: number;

  fundValueUsd: number;
  at: Instant;
  bell?: number | null;

  id?: string;
}

export interface DealInput {
  type: "deal";
  id: string;
  parties: [FundId, FundId];
  outcome: "executed" | "expired";

  breakers?: FundId[];
  at: Instant;
  bell?: number | null;
}

export interface PromiseInput {
  type: "promise";
  fund: FundId;
  season: number;
  kept: boolean;
  targetBps: number;

  actualBps: number;
  at: Instant;
}

export interface QuarterCloseInput {
  type: "quarter_close";
  quarter: number;
  at: Instant;

  spyReturnBps: number | null;
  results: { fund: FundId; returnBps: number | null }[];
}

export type ReputationInput =
  | FundCreatedInput
  | RebalanceInput
  | HoldersInput
  | CrossTradeInput
  | DealInput
  | PromiseInput
  | QuarterCloseInput;

export type RuleKind = Exclude<ReputationEventKind, "anchor">;

export interface ReputationChange {

  id: string;

  seq: number;
  fund: FundId;
  kind: RuleKind;

  at: number;
  bell: number | null;

  raw: number;

  delta: number;

  score: number;
  reason: string;

  capped: boolean;

  clamped: boolean;
}

export interface ReputationConfig {

  allowancePct: Record<FundId, number>;

  names: Record<FundId, string>;

  dayMs: number;

  quarterMs: number;
}

export interface BuyLot {
  at: number;
  usd: number;
  coins: number;
  fundValueUsd: number;
}
export interface SellFill {
  at: number;
  usd: number;
  coins: number;
}

export interface FundState {
  score: number;

  weights: Record<string, number> | null;
  cashBps: number;
  outsideBps: number;

  quarterTurnoverBps: number;

  excessSteps: number;

  frontRuns: number;

  history: { bell: number; weights: Record<string, number> }[];

  flipFrom: Record<string, number>;

  gainDay: number;
  gainUsed: number;

  head: string;
  changes: number;
  lots: Record<FundId, BuyLot[]>;
  sells: Record<FundId, SellFill[]>;
}

export interface RaiseRecord {
  bell: number;
  fund: FundId;
  asset: string;
  delta: number;
}

export interface EngineState {
  version: 1;
  seq: number;
  funds: Record<FundId, FundState>;

  raises: RaiseRecord[];
}
