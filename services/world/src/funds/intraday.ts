import { fetchText } from "../http";
import { fetchSymbol, SOURCES } from "../pulse/pulse";

export interface IntradayBar {
  symbol: string;

  ts: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface IntradayFetch {
  symbol: string;
  bars: IntradayBar[];
  currency: string | null;

  source: string | null;
  errors: string[];
}

interface YahooIntraday {
  chart?: {
    result?: {
      meta?: { currency?: string; regularMarketPrice?: number; regularMarketTime?: number };
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[] | null;
    error?: { description?: string } | null;
  };
}

const fin = (n: number | null | undefined): number | null => (typeof n === "number" && Number.isFinite(n) ? n : null);

export function parseYahooIntraday(symbol: string, text: string): { bars: IntradayBar[]; currency: string | null } {
  let parsed: YahooIntraday;
  try {
    parsed = JSON.parse(text) as YahooIntraday;
  } catch {
    throw new Error(`Yahoo returned non-JSON for ${symbol}`);
  }
  const r = parsed.chart?.result?.[0];
  if (parsed.chart?.error || !r) throw new Error(`Yahoo has no chart for ${symbol}${parsed.chart?.error?.description ? `: ${parsed.chart.error.description}` : ""}`);
  const q = r.indicators?.quote?.[0] ?? {};
  const byTs = new Map<number, IntradayBar>();
  (r.timestamp ?? []).forEach((t, i) => {
    const close = fin(q.close?.[i]);
    if (close === null || !(close > 0) || !Number.isFinite(t)) return;
    const vol = fin(q.volume?.[i]);
    byTs.set(t, { symbol, ts: new Date(t * 1000), open: fin(q.open?.[i]), high: fin(q.high?.[i]), low: fin(q.low?.[i]), close, volume: vol === null ? null : Math.round(vol) });
  });

  const bars = [...byTs.values()].sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const live = fin(r.meta?.regularMarketPrice);
  const liveAt = fin(r.meta?.regularMarketTime);
  const last = bars.at(-1);
  if (last && live && live > 0 && liveAt && liveAt * 1000 >= last.ts.getTime() && liveAt * 1000 < last.ts.getTime() + 5 * 60_000) {
    last.close = live;
    if (last.high !== null && live > last.high) last.high = live;
    if (last.low !== null && live < last.low) last.low = live;
  }
  return { bars, currency: r.meta?.currency ?? null };
}

export const yahooIntradayUrl = (host: string, symbol: string, range: "1d" | "5d"): string =>
  `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=${range}&includePrePost=false`;

const closeTs = (date: string): Date => new Date(`${date}T21:00:00Z`);

export async function fetchIntraday(
  symbol: string,
  opts: { range: "1d" | "5d"; timeoutMs: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; dailyFallback?: boolean },
): Promise<IntradayFetch> {
  const errors: string[] = [];
  for (const [name, host] of [["yahoo", "query1.finance.yahoo.com"], ["yahoo2", "query2.finance.yahoo.com"]] as const) {
    try {
      const res = await fetchText(yahooIntradayUrl(host, symbol, opts.range), {
        timeoutMs: opts.timeoutMs,
        retries: 1,
        backoffMs: 2_000,
        minSpacingMs: 400,
        headers: { accept: "application/json" },
        fetchImpl: opts.fetchImpl,
        sleep: opts.sleep,
      });
      const { bars, currency } = parseYahooIntraday(symbol, res.text);
      if (bars.length === 0) throw new Error(`no 5-minute bars for ${symbol}`);
      return { symbol, bars, currency, source: name, errors };
    } catch (err) {
      errors.push(`${name} ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (opts.dailyFallback !== false && /^[A-Z.-]+$/.test(symbol) && !symbol.includes(".") && !symbol.includes("=")) {
    const res = await fetchSymbol(symbol, 10, {
      timeoutMs: opts.timeoutMs,
      fetchImpl: opts.fetchImpl,
      sleep: opts.sleep,
      sources: SOURCES.filter((s) => s.name !== "yahoo"),
    });
    errors.push(...res.errors);
    const last = res.bars.at(-1);
    if (last) {
      return {
        symbol,
        bars: [{ symbol, ts: closeTs(last.date), open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume }],
        currency: "USD",
        source: `${res.source}-daily`,
        errors,
      };
    }
  }
  return { symbol, bars: [], currency: null, source: null, errors };
}
