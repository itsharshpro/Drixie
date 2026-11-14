export type PriceSource = "stooq" | "yahoo" | "nasdaq";

export interface DailyBar {
  symbol: string;

  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  source: PriceSource;
}

export class SourceUnavailable extends Error {
  constructor(
    readonly source: PriceSource,
    message: string,
  ) {
    super(message);
    this.name = "SourceUnavailable";
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const finite = (n: number | null | undefined): number | null => (typeof n === "number" && Number.isFinite(n) ? n : null);

function bar(symbol: string, date: string, o: number | null, h: number | null, l: number | null, c: number | null, v: number | null, source: PriceSource): DailyBar | null {
  if (!DATE_RE.test(date) || c === null || !(c > 0)) return null;
  return { symbol, date, open: finite(o), high: finite(h), low: finite(l), close: c, volume: v === null ? null : Math.round(v), source };
}

export function parseStooqCsv(symbol: string, text: string): DailyBar[] {
  const body = text.replace(/^﻿/, "").trim();
  const lines = body.split(/\r?\n/);
  const header = (lines[0] ?? "").toLowerCase().split(",").map((s) => s.trim());
  const idx = (name: string) => header.indexOf(name);
  if (idx("date") !== 0 || idx("close") === -1) {
    const kind = /^<!doctype|^<html/i.test(body) ? "a browser check page" : `"${body.slice(0, 80).replace(/\s+/g, " ")}"`;
    throw new SourceUnavailable("stooq", `Stooq returned ${kind} instead of CSV for ${symbol}`);
  }
  const iO = idx("open"), iH = idx("high"), iL = idx("low"), iC = idx("close"), iV = idx("volume");
  const out: DailyBar[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((s) => s.trim());
    const n = (i: number) => (i === -1 || cols[i] === undefined || cols[i] === "" ? null : Number(cols[i]));
    const b = bar(symbol, cols[0] ?? "", n(iO), n(iH), n(iL), n(iC), n(iV), "stooq");
    if (b) out.push(b);
  }
  return out;
}

export function dateInZone(unixSeconds: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unixSeconds * 1000));
  return parts; // en-CA formats as YYYY-MM-DD
}

interface YahooChart {
  chart?: {
    result?: {
      meta?: { symbol?: string; exchangeTimezoneName?: string };
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[] | null;
    error?: { code?: string; description?: string } | null;
  };
}

export function parseYahooChart(symbol: string, text: string): DailyBar[] {
  let parsed: YahooChart;
  try {
    parsed = JSON.parse(text) as YahooChart;
  } catch {
    throw new SourceUnavailable("yahoo", `Yahoo returned non-JSON for ${symbol}`);
  }
  const err = parsed.chart?.error;
  const r = parsed.chart?.result?.[0];
  if (err || !r) throw new SourceUnavailable("yahoo", `Yahoo has no chart for ${symbol}${err?.description ? `: ${err.description}` : ""}`);
  const tz = r.meta?.exchangeTimezoneName || "America/New_York";
  const q = r.indicators?.quote?.[0] ?? {};
  const out: DailyBar[] = [];
  (r.timestamp ?? []).forEach((ts, i) => {
    const b = bar(symbol, dateInZone(ts, tz), q.open?.[i] ?? null, q.high?.[i] ?? null, q.low?.[i] ?? null, q.close?.[i] ?? null, q.volume?.[i] ?? null, "yahoo");
    if (b) out.push(b);
  });

  const byDate = new Map(out.map((b) => [b.date, b]));
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

interface NasdaqHistorical {
  data?: { tradesTable?: { rows?: { date?: string; close?: string; volume?: string; open?: string; high?: string; low?: string }[] | null } | null } | null;
  status?: { rCode?: number; bCodeMessage?: { errorMessage?: string }[] | null };
}

const money = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function parseNasdaqHistorical(symbol: string, text: string): DailyBar[] {
  let parsed: NasdaqHistorical;
  try {
    parsed = JSON.parse(text) as NasdaqHistorical;
  } catch {
    throw new SourceUnavailable("nasdaq", `Nasdaq returned non-JSON for ${symbol}`);
  }
  const rows = parsed.data?.tradesTable?.rows;
  if (!rows) {
    const msg = parsed.status?.bCodeMessage?.[0]?.errorMessage;
    throw new SourceUnavailable("nasdaq", `Nasdaq has no history for ${symbol}${msg ? `: ${msg}` : ""}`);
  }
  const out: DailyBar[] = [];
  for (const r of rows) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r.date ?? "");
    if (!m) continue;
    const b = bar(symbol, `${m[3]}-${m[1]}-${m[2]}`, money(r.open), money(r.high), money(r.low), money(r.close), money(r.volume), "nasdaq");
    if (b) out.push(b);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function completedSessions(bars: DailyBar[], now: Date = new Date()): DailyBar[] {
  const nyDate = dateInZone(Math.floor(now.getTime() / 1000), "America/New_York");
  const nyTime = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const [hh, mm] = nyTime.split(":").map(Number) as [number, number];
  const closed = hh * 60 + mm >= 16 * 60 + 15;
  return bars.filter((b) => b.date < nyDate || (b.date === nyDate && closed));
}
