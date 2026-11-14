import { FUND_STREAM_CHANNEL, FUND_STREAM_TOPICS, type FundStreamEvent, type FundStreamTopic } from "@listed/shared";
import type { FastifyBaseLogger } from "fastify";
import { Redis } from "ioredis";

export interface FundsSubscriber {
  topics: Set<FundStreamTopic>;
  fund: string | null;
  send(e: FundStreamEvent): void;
}

export function parseFundTopics(raw: string | undefined): Set<FundStreamTopic> {
  const all = new Set(FUND_STREAM_TOPICS);
  const want = (raw ?? "")
    .slice(0, 256)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is FundStreamTopic => all.has(s as FundStreamTopic));
  return new Set(want.length ? want : FUND_STREAM_TOPICS);
}

export function eventFund(e: FundStreamEvent): string | null {
  switch (e.topic) {
    case "move":
      return e.move.fund;
    case "trade":
      return e.fund;
    case "reputation":
      return e.event.fund;
    default:
      return null;
  }
}

export class FundsHub {
  private subs = new Set<FundsSubscriber>();
  private perIp = new Map<string, number>();

  reserve(ip: string, limits: { maxPerIp: number; maxTotal: number }): (() => void) | null {
    let total = 0;
    for (const n of this.perIp.values()) total += n;
    const mine = this.perIp.get(ip) ?? 0;
    if (total >= limits.maxTotal || mine >= limits.maxPerIp) return null;
    this.perIp.set(ip, mine + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const n = (this.perIp.get(ip) ?? 1) - 1;
      if (n <= 0) this.perIp.delete(ip);
      else this.perIp.set(ip, n);
    };
  }

  connectionsFrom(ip: string): number {
    return this.perIp.get(ip) ?? 0;
  }

  add(s: FundsSubscriber): () => void {
    this.subs.add(s);
    return () => this.subs.delete(s);
  }

  get size(): number {
    return this.subs.size;
  }

  publish(e: FundStreamEvent): void {
    const fund = eventFund(e);
    for (const s of this.subs) {
      if (!s.topics.has(e.topic)) continue;
      if (s.fund && fund && s.fund !== fund) continue;
      try {
        s.send(e);
      } catch {
        this.subs.delete(s);
      }
    }
  }
}

export function fundSseFrame(e: FundStreamEvent): string {
  return `event: ${e.topic}\ndata: ${JSON.stringify(e)}\n\n`;
}

export function startFundsBridge(redisUrl: string, hub: FundsHub, log: FastifyBaseLogger): { close: () => void } {
  const sub = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
  sub.on("error", (err) => log.warn({ err: err.message }, "funds redis bridge error"));
  void sub.subscribe(FUND_STREAM_CHANNEL).catch((err: unknown) => log.warn({ err: String(err) }, "funds redis subscribe failed"));
  sub.on("message", (_channel: string, message: string) => {
    try {
      const e = JSON.parse(message) as FundStreamEvent;
      if (e && typeof e === "object" && typeof (e as { topic?: unknown }).topic === "string") hub.publish(e);
    } catch {

    }
  });
  return { close: () => sub.disconnect() };
}
