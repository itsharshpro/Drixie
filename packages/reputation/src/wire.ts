import type { ReputationEvent, ReputationPoint } from "@listed/shared";
import type { ReputationChange } from "./types";

export function toWireEvent(c: ReputationChange): ReputationEvent {
  return {
    id: c.id,
    fund: c.fund,
    at: new Date(c.at).toISOString(),
    kind: c.kind,
    delta: c.delta,
    score: c.score,
    reason: c.reason,
    bell: c.bell,
  };
}

export function scorePoints(changes: ReputationChange[], start: { at: number; score: number }): ReputationPoint[] {
  const pts: ReputationPoint[] = [{ t: new Date(start.at).toISOString(), score: start.score }];
  for (const c of changes) pts.push({ t: new Date(c.at).toISOString(), score: c.score });
  return pts;
}
