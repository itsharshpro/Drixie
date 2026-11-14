import type { Network } from "@listed/shared";
import { nearToYoctoBig } from "../units";

export interface FundsFundingPlan {

  contract: string;

  pool: string;

  reserve: string;

  operator: string;

  managersParent: string;

  manager: string;

  house: string;

  houseSubscription: string;

  relayer: string;
  players: string;
}

const PLANS: Record<Exclude<Network, "mainnet">, FundsFundingPlan> = {

  sandbox: {

    contract: "60", pool: "100", reserve: "750", operator: "50", managersParent: "2", manager: "20",
    house: "400", houseSubscription: "20", relayer: "0", players: "0",
  },

  testnet: {

    contract: "0", pool: "1", reserve: "5.5", operator: "1.5", managersParent: "0.05", manager: "0.5",
    house: "0.5", houseSubscription: "0.06", relayer: "1.5", players: "2",
  },
};

export type FundsFunding = Record<keyof FundsFundingPlan, bigint>;

export function fundsFundingEnvName(key: keyof FundsFundingPlan): string {
  return `FUNDS_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}_NEAR`;
}

export function fundsFundingPlan(network: Network, env: (name: string) => string | undefined): FundsFunding {
  if (network === "mainnet") throw new Error("Mainnet deployment is disabled in this repo.");
  const plan = PLANS[network];
  const out = {} as FundsFunding;
  for (const key of Object.keys(plan) as Array<keyof FundsFundingPlan>) out[key] = nearToYoctoBig(env(fundsFundingEnvName(key)) ?? plan[key]);
  return out;
}

const NEAR = 10n ** 24n;

const PER_BYTE = 10n ** 19n;

export interface FundsBudgetRow {
  item: string;
  near: bigint;
  note: string;
}

export function fundsBudget(f: FundsFunding, o: { wasmBytes: number; funds: number; managers: number; house: number; network: Network }): { rows: FundsBudgetRow[]; total: bigint } {
  const code = BigInt(o.wasmBytes) * PER_BYTE;
  const state = 60_000n * PER_BYTE;
  const rows: FundsBudgetRow[] = [
    { item: "Contract code storage", near: code, note: `${(o.wasmBytes / 1024).toFixed(0)} KB wasm at 1e19 yocto per byte` },
    { item: "Contract state", near: state, note: "universe (48 assets), 5 funds, pools, seats, NFTs, first orders (~60 KB)" },
    { item: `Pools (x${o.funds})`, near: f.pool * BigInt(o.funds), note: `${fmt(f.pool)} NEAR each, coin side minted at NAV $10` },
    { item: "Vault reserve", near: f.reserve, note: "backs redemptions when NAV rises above what users paid in" },
    { item: "Operator (NAV oracle)", near: f.operator, note: "post_nav every 15 min for a 4-day season + quarter closes (gas)" },
    { item: "Managers parent", near: f.managersParent, note: "managers.<root> account" },
    { item: `Managers (x${o.managers})`, near: f.manager * BigInt(o.managers), note: "commit + reveal every bell (gas)" },
    { item: `House investors (x${o.house})`, near: f.house * BigInt(o.house), note: `opening buy-ins of ${fmt(f.houseSubscription)} NEAR + rule trades` },
  ];
  if (o.network !== "sandbox") {
    rows.push({ item: "Relayer gas wallet", near: f.relayer, note: "gasless redeem / sell / cancel + gas refunds on deposit calls" });
    rows.push({ item: "Players sign-up faucet", near: f.players, note: "STARTER_BALANCE_NEAR per passkey sign-up (0.2 on testnet → 10 sign-ups)" });
  } else {
    rows.unshift({ item: "Contract account", near: f.contract, note: "drixie.test.near starting balance (storage + slack)" });
  }
  rows.push({ item: "Deploy gas margin", near: NEAR, note: "create accounts, deploy, init, universe, 5 create_fund, keys" });
  const total = rows.reduce((s, r) => s + r.near, 0n);
  return { rows, total };
}

function fmt(v: bigint): string {
  const whole = v / NEAR;
  const frac = ((v % NEAR) * 100n) / NEAR;
  return frac ? `${whole}.${frac.toString().padStart(2, "0").replace(/0$/, "")}` : `${whole}`;
}
