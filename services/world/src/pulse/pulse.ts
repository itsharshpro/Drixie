import { fetchText } from "../http";
import { completedSessions, parseNasdaqHistorical, parseStooqCsv, parseYahooChart, SourceUnavailable, type DailyBar, type PriceSource } from "./bars";

export const BACKFILL_DAYS = 370;
export const UPDATE_DAYS = 31;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function stooqUrl(symbol: string): string {
  return `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&i=d`;
}
export function yahooUrl(symbol: string, days: number): string {
  const range = days > 200 ? "1y" : days > 31 ? "6mo" : "1mo";
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
}
export function nasdaqUrl(symbol: string, days: number, now = new Date()): string {
  const from = isoDay(new Date(now.getTime() - days * 86_400_000));
  return `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${from}&limit=9999&todate=${isoDay(now)}`;
}

interface SourceDef {
  name: PriceSource;
  url: (symbol: string, days: number) => string;
  parse: (symbol: string, text: string) => DailyBar[];
  headers?: Record<string, string>;
}

export const SOURCES: SourceDef[] = [
  { name: "stooq", url: (s) => stooqUrl(s), parse: parseStooqCsv, headers: { accept: "text/csv,text/plain,*/*" } },
  { name: "yahoo", url: yahooUrl, parse: parseYahooChart, headers: { accept: "application/json" } },
  { name: "nasdaq", url: (s, d) => nasdaqUrl(s, d), parse: parseNasdaqHistorical, headers: { accept: "application/json, text/plain, */*" } },
];

export interface SymbolFetch {
  symbol: string;
  bars: DailyBar[];
  source: PriceSource | null;
  errors: string[];
}

export async function fetchSymbol(
  symbol: string,
  days: number,
  opts: { timeoutMs: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: Date; sources?: SourceDef[] },
): Promise<SymbolFetch> {
  const errors: string[] = [];
  const now = opts.now ?? new Date();
  const since = isoDay(new Date(now.getTime() - days * 86_400_000));
  for (const src of opts.sources ?? SOURCES) {
    try {
      const res = await fetchText(src.url(symbol, days), {
        timeoutMs: opts.timeoutMs,
        retries: 1,
        backoffMs: 3_000,
        minSpacingMs: 1_500,
        headers: src.headers,
        fetchImpl: opts.fetchImpl,
        sleep: opts.sleep,
      });
      const bars = completedSessions(src.parse(symbol, res.text), now).filter((b) => b.date >= since);
      if (bars.length === 0) throw new SourceUnavailable(src.name, `${src.name} returned no bars for ${symbol} since ${since}`);
      return { symbol, bars, source: src.name, errors };
    } catch (err) {
      errors.push(`${src.name} ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { symbol, bars: [], source: null, errors };
}

export function needsBackfill(coverage: { rows: number; first: string } | undefined, now = new Date()): boolean {
  if (!coverage || coverage.rows < 200) return true;
  const want = isoDay(new Date(now.getTime() - (BACKFILL_DAYS - 15) * 86_400_000));
  return coverage.first > want;
}
