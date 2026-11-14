"use client";

import type { FundDetail, Holding } from "@listed/shared";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { toCandles } from "@/lib/funds/candles";
import { bps, pct, price, toneOf } from "@/lib/funds/format";
import { BASKET_TONE, basketLabel } from "@/lib/funds/meta";
import { useAssetCandles } from "@/lib/funds/queries";
import { useIsPhone } from "@/lib/hooks/use-media";
import { MiniCandles } from "../trading/mini-candles";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { ChangeChip } from "../ui/change-chip";
import { CompanyMark } from "../ui/company-mark";
import { EmptyState } from "../ui/empty-state";
import { Term } from "../ui/term";
import { Tooltip } from "../ui/tooltip";
import { NAV } from "../ui/transitions";

const FORWARD = [...NAV.forward];
const CASH_TONE = "var(--line-strong)";

interface Slice {
  key: string;
  label: string;
  bps: number;
  color: string;
}

function slicesOf(fund: FundDetail): Slice[] {
  const list = [...fund.holdings].sort((a, b) => b.bps - a.bps).map((h) => ({ key: h.asset, label: h.asset, bps: h.bps, color: BASKET_TONE[h.basket] ?? "var(--viz-slate)" }));
  if (fund.cashBps > 0) list.push({ key: "cash", label: "Cash", bps: fund.cashBps, color: CASH_TONE });
  return list;
}

export function HoldingsDonut({ fund, size = 200 }: { fund: FundDetail; size?: number }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const slices = useMemo(() => slicesOf(fund), [fund]);
  const total = slices.reduce((s, x) => s + x.bps, 0) || 10_000;
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? (1.5 / 360) * c : 0;
  const offsets = slices.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + (slices[i - 1]!.bps / total) * c], []);
  const hovered = slices.find((s) => s.key === hover) ?? null;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`Weights: ${slices.map((s) => `${s.label} ${bps(s.bps)}`).join(", ")}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={20} />
        {slices.map((s, i) => {
          const len = (s.bps / total) * c;
          const dash = Math.max(0, len - gap);
          return (
            <motion.circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.key ? 26 : 20}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offsets[i]!}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: hover && hover !== s.key ? 0.45 : 1 }}
              transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.04 }}
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {hovered ? (
          <>
            <span className="num text-title-sm font-semibold text-ink">{bps(hovered.bps)}</span>
            <span className="num max-w-[60%] truncate text-caption text-ink-2">{hovered.label}</span>
          </>
        ) : (
          <>
            <span className="num text-title-sm font-semibold text-ink">{fund.holdings.length}</span>
            <span className="text-caption text-ink-2">holdings{fund.cashBps > 0 ? ` + ${bps(fund.cashBps)} cash` : ""}</span>
          </>
        )}
      </div>
    </div>
  );
}

function BasketLegend({ fund }: { fund: FundDetail }) {
  const byBasket = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of fund.holdings) m.set(h.basket, (m.get(h.basket) ?? 0) + h.bps);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [fund.holdings]);
  return (
    <ul className="flex flex-col gap-2">
      {byBasket.map(([b, w]) => (
        <li key={b} className="flex items-center gap-2 text-caption">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: BASKET_TONE[b as keyof typeof BASKET_TONE] }} />
          <span className="min-w-0 flex-1 truncate text-ink-2">{basketLabel(b)}</span>
          <span className="num font-medium text-ink">{bps(w)}</span>
        </li>
      ))}
      {fund.cashBps > 0 && (
        <li className="flex items-center gap-2 text-caption">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: CASH_TONE }} />
          <span className="min-w-0 flex-1 truncate text-ink-2">Cash</span>
          <span className="num font-medium text-ink">{bps(fund.cashBps)}</span>
        </li>
      )}
    </ul>
  );
}

function AssetCandles({ asset, height = 32 }: { asset: string; height?: number }) {
  const q = useAssetCandles(asset, "1h");
  const candles = useMemo(() => toCandles(q.data?.candles).slice(-24), [q.data]);
  return (
    <MiniCandles
      candles={candles}
      count={24}
      height={height}
      loading={!q.data && q.isPending}
      interval="1h"
      tooltip={false}
      focusable={false}
      emptyLabel="No prices yet"
      label={`${asset} hourly candles, last 24 hours`}
    />
  );
}

function WeightBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="num w-12 text-right font-medium text-ink">{bps(value)}</span>
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-fill @2xl:block" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (value / 2500) * 100)}%`, background: color }} />
      </span>
    </span>
  );
}

function assetHref(id: string) {
  return `/app/s/${encodeURIComponent(id)}`;
}

function HoldingRow({ h }: { h: Holding }) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="py-2.5 pl-5 md:pl-6">
        <Link href={assetHref(h.asset)} transitionTypes={FORWARD} className="flex min-h-11 min-w-0 items-center gap-3 rounded-control outline-none hover:opacity-80 focus-visible:outline-2 focus-visible:outline-brand">
          <CompanyMark ticker={h.asset} size={32} />
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-body-sm font-medium text-ink">{h.name}</span>
              {h.estimated && (
                <Tooltip content="Startup price estimated from its last funding round and the news">
                  <span className="inline-flex">
                    <Badge tone="gold">est.</Badge>
                  </span>
                </Tooltip>
              )}
            </span>
            <span className="truncate text-caption text-ink-3">
              <span className="num">{h.asset}</span> · {basketLabel(h.basket)}
            </span>
          </span>
        </Link>
      </td>
      <td className="py-2.5 pr-3 text-right">
        <WeightBar value={h.bps} color={BASKET_TONE[h.basket]} />
      </td>
      <td className="num hidden py-2.5 pr-3 text-right text-ink @lg:table-cell">{price(h.price)}</td>
      <td className="py-2.5 pr-3 text-right">
        <ChangeChip value={h.ret1d} size="sm" />
      </td>
      <td className={cn("num hidden py-2.5 pr-3 text-right @3xl:table-cell", toneOf(h.retSinceEntry))}>{pct(h.retSinceEntry)}</td>
      <td className="hidden w-[132px] py-2 pl-2 pr-5 @4xl:table-cell md:pr-6">
        <AssetCandles asset={h.asset} />
      </td>
    </tr>
  );
}

function HoldingCard({ h }: { h: Holding }) {
  return (
    <li>
      <Link href={assetHref(h.asset)} transitionTypes={FORWARD} className="flex items-center gap-3 px-5 py-3 outline-none active:bg-fill focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand">
        <CompanyMark ticker={h.asset} size={32} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-body-sm font-medium text-ink">{h.name}</span>
            {h.estimated && <Badge tone="gold">est.</Badge>}
          </span>
          <span className="truncate text-caption text-ink-3">
            <span className="num">{h.asset}</span> · {price(h.price)}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="num text-body-sm font-medium text-ink">{bps(h.bps)}</span>
          <ChangeChip value={h.ret1d} size="sm" />
        </span>
      </Link>
    </li>
  );
}

export function HoldingsCard({ fund, className }: { fund: FundDetail; className?: string }) {
  const phone = useIsPhone();
  const rows = useMemo(() => [...fund.holdings].sort((a, b) => b.bps - a.bps), [fund.holdings]);
  return (
    <Card as="section" id="holdings" aria-labelledby="holdings-h" className={cn("@container scroll-mt-24 overflow-hidden", className)}>
      <CardHeader id="holdings-h" title="The 10 holdings" subtitle="Weights after the last reveal · real prices" meta={<Term id="mandate">Caps</Term>} />
      {rows.length === 0 ? (
        <EmptyState icon="portfolio" title="No holdings yet" body="The manager's first reveal sets its 10 holdings, right after the next rebalance bell." compact />
      ) : (
        <div className="grid gap-0 @3xl:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center gap-5 border-line px-5 pb-5 pt-4 @3xl:border-r md:px-6">
            <HoldingsDonut fund={fund} />
            <div className="w-full">
              <BasketLegend fund={fund} />
            </div>
          </div>
          {phone ? (
            <ul className="flex flex-col divide-y divide-line border-t border-line">
              {rows.map((h) => (
                <HoldingCard key={h.asset} h={h} />
              ))}
            </ul>
          ) : (
            <table className="w-full table-fixed border-collapse self-start text-body-sm">
              <thead>
                <tr className="border-y border-line text-left text-caption font-medium text-ink-3 @3xl:border-t-0">
                  <th scope="col" className="py-2.5 pl-5 font-medium md:pl-6">
                    Holding
                  </th>
                  <th scope="col" className="w-[84px] py-2.5 pr-3 text-right font-medium @2xl:w-[156px]">
                    Weight
                  </th>
                  <th scope="col" className="hidden w-[100px] py-2.5 pr-3 text-right font-medium @lg:table-cell">
                    Price
                  </th>
                  <th scope="col" className="w-[88px] py-2.5 pr-3 text-right font-medium">
                    1d
                  </th>
                  <th scope="col" className="hidden w-[92px] py-2.5 pr-3 text-right font-medium @3xl:table-cell">
                    Since in
                  </th>
                  <th scope="col" className="hidden w-[132px] py-2.5 pl-2 pr-5 font-medium @4xl:table-cell md:pr-6">
                    Hourly · 24h
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <HoldingRow key={h.asset} h={h} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}
