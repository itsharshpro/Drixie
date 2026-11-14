import postgres from "postgres";

export interface PricePoint {
  t: number;
  c: number;
}

export interface DbPriceSource {
  series(assets: readonly string[], sinceMs: number): Promise<Map<string, PricePoint[]>>;
  close(): Promise<void>;
}

export function dbPriceSource(url: string): DbPriceSource {
  const sql = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 5, prepare: false, onnotice: () => {} });
  return {
    async series(assets, sinceMs) {
      const out = new Map<string, PricePoint[]>();
      if (!assets.length) return out;
      const since = new Date(sinceMs);
      const bars = await sql<{ asset: string; ts: Date; close_usd: number | null; close: number }[]>`
        select asset, ts, close_usd, close from asset_prices
        where asset = any(${assets as string[]}) and ts >= ${since}
        order by asset, ts`;
      for (const b of bars) {
        const c = Number(b.close_usd ?? b.close);
        if (!(c > 0)) continue;
        const list = out.get(b.asset) ?? [];
        list.push({ t: b.ts.getTime(), c });
        out.set(b.asset, list);
      }

      const marks = await sql<{ asset: string; date: string | Date; mark: number; prev_mark: number }[]>`
        select asset, date, mark, prev_mark from startup_marks
        where asset = any(${assets as string[]}) and date >= ${since.toISOString().slice(0, 10)}::date - 1
        order by asset, date`;
      const listed = new Set(out.keys());
      for (const m of marks) {
        if (listed.has(m.asset)) continue; // a market price beats an estimated mark (e.g. SPCX after its listing)
        const t = new Date(typeof m.date === "string" ? `${m.date}T00:00:00Z` : m.date).getTime();
        const list = out.get(m.asset) ?? [];
        if (!list.length && Number(m.prev_mark) > 0) list.push({ t: t - 86_400_000, c: Number(m.prev_mark) });
        if (Number(m.mark) > 0) list.push({ t, c: Number(m.mark) });
        out.set(m.asset, list);
      }
      return out;
    },
    async close() {
      await sql.end({ timeout: 2 });
    },
  };
}
