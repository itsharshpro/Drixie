import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../config/paths.js";

const SALT_HEX = /^[0-9a-fA-F]{64}$/;

function readSaltFile(p: string): string | null {
  if (!existsSync(p)) return null;
  try {
    const salt = (JSON.parse(readFileSync(p, "utf8")) as { salt?: unknown }).salt;
    return typeof salt === "string" && SALT_HEX.test(salt) ? salt.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function dnaCommit(saltHex: string): string {
  return createHash("sha256").update(Buffer.from(saltHex, "hex")).digest("hex");
}

export function readFundSalt(network: string, fund: string): string | null {
  return (
    readSaltFile(join(dataDir(), "keys", network, "dna", "funds", `${fund.toLowerCase()}.json`)) ??
    readSaltFile(join(dataDir(), "keys", network, "dna", `${fund.toUpperCase()}.json`))
  );
}

export interface FundTraits {
  risk: number;
  patience: number;
  greed: number;
  loyalty: number;
  smarts: number;
}

export const NEUTRAL_FUND_TRAITS: Readonly<FundTraits> = Object.freeze({ risk: 5, patience: 5, greed: 5, loyalty: 5, smarts: 5 });

export type FundDnaSource = "revealed" | "derived" | "neutral";

export interface FundDna {
  traits: FundTraits;
  source: FundDnaSource;
  commit: string | null;
  note: string | null;
}

const HEX64 = /^[0-9a-f]{64}$/;

export function fallbackSeed(fund: string, season: number): string {
  return createHash("sha256").update(`drixie:dna:${fund}:${season}`).digest("hex");
}

export function deriveFundTraits(saltHex: string, seedHex: string): FundTraits {
  const s = saltHex.toLowerCase();
  const d = seedHex.toLowerCase();
  if (!HEX64.test(s) || !HEX64.test(d)) throw new Error("salt and seed must be 64 hex characters");
  const h = createHash("sha256").update(Buffer.concat([Buffer.from(s, "hex"), Buffer.from(d, "hex")])).digest();
  const t = (i: number) => 1 + ((h[i] as number) % 10);
  return { risk: t(0), patience: t(1), greed: t(2), loyalty: t(3), smarts: t(4) };
}

const clamp = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 5;
};

export function normalizeTraits(raw: Partial<Record<keyof FundTraits, unknown>>): FundTraits {
  return { risk: clamp(raw.risk), patience: clamp(raw.patience), greed: clamp(raw.greed), loyalty: clamp(raw.loyalty), smarts: clamp(raw.smarts) };
}

export function resolveFundDna(o: {
  fund: string;
  network: string;
  season: number;
  chainCommit?: string | null;
  chainSeed?: string | null;
  revealed?: Partial<Record<keyof FundTraits, unknown>> | null;
  saltReader?: (network: string, fund: string) => string | null;
}): FundDna {
  if (o.revealed) return { traits: normalizeTraits(o.revealed), source: "revealed", commit: o.chainCommit ?? null, note: null };
  const salt = (o.saltReader ?? readFundSalt)(o.network, o.fund);
  if (!salt) return { traits: { ...NEUTRAL_FUND_TRAITS }, source: "neutral", commit: o.chainCommit ?? null, note: "the operator's DNA salt file is missing" };
  const commit = dnaCommit(salt);
  if (o.chainCommit && o.chainCommit.toLowerCase() !== commit) {
    return { traits: { ...NEUTRAL_FUND_TRAITS }, source: "neutral", commit: o.chainCommit, note: "the DNA salt file does not match the on-chain commit" };
  }
  const seed = o.chainSeed && HEX64.test(o.chainSeed.toLowerCase()) ? o.chainSeed : fallbackSeed(o.fund, o.season);
  return { traits: deriveFundTraits(salt, seed), source: "derived", commit, note: null };
}

export function traitBrief(t: FundTraits): string {
  const lvl = (v: number) => (v <= 3 ? "low" : v >= 8 ? "high" : "medium");
  return [
    `risk appetite ${lvl(t.risk)} (${t.risk}/10)`,
    `patience ${lvl(t.patience)} (${t.patience}/10): ${t.patience >= 7 ? "you hate churn and hold through noise" : t.patience <= 3 ? "you react quickly and trade often" : "you trade when there is a reason"}`,
    `greed ${lvl(t.greed)} (${t.greed}/10): ${t.greed >= 7 ? "you are tempted by quick gains, including other funds' coins" : "you care more about steady returns than quick wins"}`,
    `loyalty ${lvl(t.loyalty)} (${t.loyalty}/10): ${t.loyalty >= 7 ? "you hold what you buy and never pump and dump" : t.loyalty <= 3 ? "you sell quickly once a trade has worked" : "you hold while the reason holds"}`,
    `smarts ${t.smarts}/10`,
  ].join("; ");
}

export function thinkEvery(patience: number): number {
  const p = clamp(patience);
  return p <= 3 ? 1 : p <= 6 ? 2 : p <= 8 ? 3 : 4;
}

export function decisionTemperature(t: FundTraits): number {
  return Number(Math.min(0.9, Math.max(0.1, 0.25 + (t.risk - 5) * 0.03 + (5 - t.patience) * 0.02)).toFixed(2));
}
