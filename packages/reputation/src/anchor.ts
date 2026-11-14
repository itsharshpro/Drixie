import type { FundId } from "@listed/shared";
import { canonicalChange, genesisHead } from "./engine";
import { sha256Hex } from "./sha256";
import type { EngineState, ReputationChange } from "./types";

export interface AnchorLeaf {
  fund: FundId;

  score: number;

  scoreTenths: number;
  head: string;
  changes: number;

  leaf: string;
}

export interface AnchorPayload {
  quarter: number;

  root: string;

  scores: { fund: FundId; score: number }[];
  leaves: AnchorLeaf[];
}

export function leafLine(fund: FundId, scoreTenths: number, head: string, changes: number): string {
  return `drixie-reputation-leaf-v1|${fund}|${scoreTenths}|${head}|${changes}`;
}

export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("");
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i]!;
      const r = level[i + 1] ?? l;
      next.push(sha256Hex(l + r));
    }
    level = next;
  }
  return level[0]!;
}

export function buildAnchor(state: EngineState, quarter: number): AnchorPayload {
  const leaves: AnchorLeaf[] = Object.keys(state.funds)
    .sort()
    .map((fund) => {
      const fs = state.funds[fund]!;
      const scoreTenths = Math.round(fs.score * 10);
      return { fund, score: fs.score, scoreTenths, head: fs.head, changes: fs.changes, leaf: sha256Hex(leafLine(fund, scoreTenths, fs.head, fs.changes)) };
    });
  return {
    quarter,
    root: merkleRoot(leaves.map((l) => l.leaf)),
    scores: leaves.map((l) => ({ fund: l.fund, score: Math.floor(l.scoreTenths / 10) })),
    leaves,
  };
}

export function anchorArgs(p: AnchorPayload): { quarter: number; root: string; scores: { fund: FundId; score: number }[] } {
  return { quarter: p.quarter, root: p.root, scores: p.scores };
}

export function chainHead(fund: FundId, changes: ReputationChange[]): string {
  let head = genesisHead(fund);
  for (const c of changes) head = sha256Hex(`${head}|${canonicalChange(c)}`);
  return head;
}

export function verifyAnchor(p: AnchorPayload): boolean {
  const sorted = [...p.leaves].sort((a, b) => (a.fund < b.fund ? -1 : a.fund > b.fund ? 1 : 0));
  for (const l of sorted) {
    if (sha256Hex(leafLine(l.fund, l.scoreTenths, l.head, l.changes)) !== l.leaf) return false;
  }
  if (merkleRoot(sorted.map((l) => l.leaf)) !== p.root) return false;
  if (p.scores.length !== sorted.length) return false;
  return sorted.every((l, i) => p.scores[i]?.fund === l.fund && p.scores[i]?.score === Math.floor(l.scoreTenths / 10));
}

export function verifyFundLog(leaf: AnchorLeaf, changes: ReputationChange[]): boolean {
  const last = changes[changes.length - 1];
  const scoreOk = last ? Math.round(last.score * 10) === leaf.scoreTenths : true;
  return scoreOk && changes.length === leaf.changes && chainHead(leaf.fund, changes) === leaf.head;
}
