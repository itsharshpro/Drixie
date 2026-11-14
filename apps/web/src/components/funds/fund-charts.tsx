"use client";

import type { FundCandleInterval, FundDetail, NavRange } from "@listed/shared";
import { useMemo, useState } from "react";
import { formatClock, formatDay } from "@/lib/format";
import { candlesChange, chartInterval, FUND_INTERVAL_LABEL, FUND_INTERVAL_WORDS, FUND_INTERVALS, rangeLabel, toCandles } from "@/lib/funds/candles";
import { pct, price } from "@/lib/funds/format";
import { fundColor } from "@/lib/funds/meta";
import { useFundCandles, useNav } from "@/lib/funds/queries";
import { ChartCard, ChartCardSkeleton } from "../charts/chart-frame";
import { LineChart } from "../charts/line-chart";
import { CandleChartCanvas } from "../trading/candle-chart-canvas";
import { TimeframeTabs } from "../trading/timeframe-tabs";
import { EmptyState } from "../ui/empty-state";
import { Crossfade } from "../ui/transitions";
import { FundDot } from "./fund-mark";

const RANGES: readonly NavRange[] = ["1D", "4D", "SEASON", "ALL"];
const RANGE_LABEL: Record<NavRange, string> = { "1D": "1d", "4D": "4d", SEASON: "season", ALL: "all" };
const RANGE_WORDS: Record<NavRange, string> = { "1D": "last 24 hours", "4D": "last 4 days", SEASON: "this season", ALL: "since launch" };

export function NavVsSpyChart({ fund, height = 240, className }: { fund: FundDetail; height?: number; className?: string }) {
  const [range, setRange] = useState<NavRange>("SEASON");
  const q = useNav(fund.id, range);
  const points = useMemo(() => q.data?.points ?? [], [q.data]);
  const last = points[points.length - 1];
  const daily = range !== "1D";
  const labels = points.map((p) => (daily ? `${formatDay(p.t)} ${formatClock(p.t)}` : formatClock(p.t)));
  const lastSpy = [...points].reverse().find((p) => p.spy !== null)?.spy ?? null;
  return (
    <ChartCard
      className={className}
      title="NAV vs SPY"
      sub={`Return, % · ${RANGE_WORDS[range]}`}
      value={price(fund.nav)}
      change={last?.ret ?? null}
      changeLabel={RANGE_LABEL[range]}
      controls={<TimeframeTabs<NavRange> value={range} onChange={setRange} options={RANGES} labels={RANGE_LABEL} label="NAV range" />}
      legend={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-2">
            <FundDot fund={fund.id} /> {fund.name} <span className="num">{pct(last?.ret ?? null)}</span>
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded-full bg-viz-slate" /> SPY <span className="num">{pct(lastSpy)}</span>
          </span>
        </span>
      }
      footnote="NAV is posted on-chain after every bell, with a hash of the prices used."
    >
      <Crossfade value={range}>
        {!q.data && q.isPending ? (
          <div className="skeleton rounded-control" style={{ height }} aria-hidden />
        ) : points.length < 2 ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <EmptyState icon="index" title="No NAV history yet" body="The line starts after the first two NAV posts, one per rebalance bell." compact />
          </div>
        ) : (
          <LineChart
            label={`${fund.name} return vs SPY, ${RANGE_WORDS[range]}`}
            height={height}
            labels={labels}
            format={(v) => pct(v, 2)}
            series={[
              { name: fund.name, tone: fundColor(fund.id), values: points.map((p) => p.ret), area: true },
              { name: "SPY", tone: "slate", values: points.map((p) => p.spy) },
            ]}
          />
        )}
      </Crossfade>
    </ChartCard>
  );
}

export function CoinCandlesChart({ fund, height = 240, className }: { fund: FundDetail; height?: number; className?: string }) {
  const [interval, setIv] = useState<FundCandleInterval>("15m");
  const q = useFundCandles(fund.id, interval);
  const candles = useMemo(() => toCandles(q.data?.candles), [q.data]);
  return (
    <ChartCard
      className={className}
      title="Coin price"
      sub={`USD per coin · ${FUND_INTERVAL_WORDS[interval]} candles from its pool`}
      value={price(fund.coinPrice)}
      change={candlesChange(candles)}
      changeLabel={rangeLabel(candles)}
      controls={
        <TimeframeTabs<FundCandleInterval> value={interval} onChange={setIv} options={FUND_INTERVALS} labels={FUND_INTERVAL_LABEL} label="Candle interval" />
      }
      footnote="Trades in the coin's own pool. Buying in at NAV does not move it."
    >
      <Crossfade value={interval}>
        {!q.data && q.isPending ? (
          <div className="skeleton rounded-control" style={{ height }} aria-hidden />
        ) : candles.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <EmptyState icon="market" title="No coin trades yet" body="Candles appear with the first trade in this coin's pool." compact />
          </div>
        ) : (
          <CandleChartCanvas
            candles={candles}
            interval={chartInterval(interval)}
            ticker={fund.name.toUpperCase()}
            height={height}
            animateKey={`${fund.id}:${interval}`}
          />
        )}
      </Crossfade>
    </ChartCard>
  );
}

export function FundChartsSkeleton() {
  return (
    <>
      <ChartCardSkeleton height={240} value />
      <ChartCardSkeleton height={240} value />
    </>
  );
}
