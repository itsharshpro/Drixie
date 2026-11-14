import { dz, type Db } from "@listed/db";

export const CANDLE_INTERVALS: Record<string, number> = { "5m": 300, "15m": 900, "1h": 3600, "1d": 86400 };

export function bucketOf(at: Date, secs: number): Date {
  const ms = secs * 1000;
  return new Date(Math.floor(at.getTime() / ms) * ms);
}

export async function upsertCandles(db: Db, points: { fund: string; at: Date; price: number; usd: number }[]): Promise<void> {
  for (const p of points) {
    if (!Number.isFinite(p.price) || p.price <= 0) continue;
    for (const [interval, secs] of Object.entries(CANDLE_INTERVALS)) {
      const bucket = bucketOf(p.at, secs);
      await db.execute(dz.sql`
        INSERT INTO fund_candles (fund, interval, bucket, open, high, low, close, volume_usd)
        VALUES (${p.fund}, ${interval}, ${bucket.toISOString()}::timestamptz, ${p.price}, ${p.price}, ${p.price}, ${p.price}, ${Math.abs(p.usd) || 0})
        ON CONFLICT (fund, interval, bucket) DO UPDATE SET
          high = GREATEST(fund_candles.high, EXCLUDED.high),
          low = LEAST(fund_candles.low, EXCLUDED.low),
          close = EXCLUDED.close,
          volume_usd = fund_candles.volume_usd + EXCLUDED.volume_usd`);
    }
  }
}
