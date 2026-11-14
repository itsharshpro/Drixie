"use client";

import type { FundRow } from "@listed/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { pct, pp, price, toneOf } from "@/lib/funds/format";
import { MANDATE_RISK, STATUS_LABEL } from "@/lib/funds/meta";
import { fundQuery } from "@/lib/funds/queries";
import { Badge } from "../ui/badge";
import { ChangeChip } from "../ui/change-chip";
import { NumberRoll } from "../ui/number-roll";
import { Segmented } from "../ui/segmented";
import { Skeleton } from "../ui/skeleton";
import { Term } from "../ui/term";
import { AnimatedItem, AnimatedList, NAV, useTransitionState } from "../ui/transitions";
import { FundMark } from "../ui/fund-mark";
import { PremiumChip, RiskBadge } from "../ui/fund-chips";
import { ReputationGauge } from "../ui/reputation-gauge";
import { fundCharacter } from "@/lib/funds/character";
import { VividFlash } from "./vivid-flash";

const FORWARD = [...NAV.forward];

export type SortKey = "nav" | "coin" | "premium" | "ret1d" | "vsSpy" | "reputation" | "outside" | "risk";
type Dir = "asc" | "desc";

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);

const VALUE: Record<SortKey, (f: FundRow) => number | null> = {
  nav: (f) => num(f.nav),
  coin: (f) => num(f.coinPrice),
  premium: (f) => num(f.premium),
  ret1d: (f) => num(f.ret1d),
  vsSpy: (f) => num(f.vsSpy ?? f.retSeason),
  reputation: (f) => num(f.reputation),
  outside: (f) => num(f.outsideHolders),
  risk: (f) => MANDATE_RISK[f.mandate] ?? null,
};

export function sortFunds(rows: readonly FundRow[], key: SortKey, dir: Dir): FundRow[] {
  const get = VALUE[key];
  return rows
    .map((f, i) => ({ f, i, v: get(f) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const d = dir === "asc" ? a.v - b.v : b.v - a.v;
      return d !== 0 ? d : a.i - b.i;
    })
    .map((x) => x.f);
}

const LABEL: Record<SortKey, string> = {
  nav: "NAV",
  coin: "Coin",
  premium: "Premium",
  ret1d: "1d",
  vsSpy: "vs SPY",
  reputation: "Reputation",
  outside: "Outside money",
  risk: "Risk",
};

const FIRST: Record<SortKey, Dir> = { nav: "desc", coin: "desc", premium: "desc", ret1d: "desc", vsSpy: "desc", reputation: "desc", outside: "desc", risk: "asc" };

function useFundLink(id: string) {
  const qc = useQueryClient();
  const warm = () => void qc.prefetchQuery(fundQuery(id));
  return { href: `/app/f/${id}`, transitionTypes: FORWARD, onPointerEnter: warm, onFocus: warm };
}

function forwardRowClick(e: MouseEvent, href: string, link: HTMLAnchorElement | null): void {
  const target = e.target as HTMLElement;
  if (target.closest("a,button,input,select,textarea,[role=button]")) return;
  if (window.getSelection()?.toString()) return;
  if (e.metaKey || e.ctrlKey) {
    window.open(href, "_blank", "noopener");
    return;
  }
  link?.click();
}

const COL = {
  coin: "hidden @3xl:table-cell",
  premium: "hidden @2xl:table-cell",
  spy: "hidden @xl:table-cell",
  rep: "hidden @lg:table-cell",
  outside: "hidden @5xl:table-cell",
  risk: "hidden @4xl:table-cell",
} as const;

function StatusTag({ f }: { f: FundRow }) {
  if (f.status === "active") return null;
  return <Badge tone={f.status === "liquidated" ? "solid" : "gold"}>{STATUS_LABEL[f.status]}</Badge>;
}

export function FundsTable({ rows, phone }: { rows: FundRow[]; phone: boolean }) {
  const [sort, setSort] = useTransitionState<{ key: SortKey; dir: Dir }>({ key: "vsSpy", dir: "desc" });
  const sorted = useMemo(() => sortFunds(rows, sort.key, sort.dir), [rows, sort]);
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST[key] }));

  if (phone) {
    const keys: SortKey[] = ["vsSpy", "ret1d", "reputation", "risk"];
    return (
      <div>
        <div className="px-5 pb-3">
          <Segmented
            label="Sort funds"
            size="sm"
            block
            value={keys.includes(sort.key) ? sort.key : "vsSpy"}
            onChange={(k) => setSort({ key: k, dir: FIRST[k] })}
            options={keys.map((k) => ({ value: k, label: k === "vsSpy" ? "Season" : k === "ret1d" ? "Today" : LABEL[k] }))}
          />
        </div>
        <AnimatedList as="ul" className="flex flex-col border-t border-line">
          {sorted.map((f, i) => (
            <AnimatedItem as="li" key={f.id} index={i} className="border-b border-line last:border-b-0">
              <PhoneRow f={f} />
            </AnimatedItem>
          ))}
        </AnimatedList>
      </div>
    );
  }

  const head = (key: SortKey, cls: string, label: ReactNode = LABEL[key], align: "left" | "right" = "right") => {
    const active = sort.key === key;
    const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("p-0 font-medium", cls)}>
        <button
          type="button"
          onClick={() => toggle(key)}
          className={cn(
            "group/h inline-flex min-h-11 w-full items-center gap-1 px-3 outline-none transition-colors duration-150 hover:text-ink focus-visible:text-ink focus-visible:underline active:scale-[0.98]",
            align === "right" ? "justify-end" : "justify-start",
            active ? "text-ink" : "text-ink-3",
          )}
        >
          <span>{label}</span>
          <Icon
            aria-hidden
            className={cn("size-3 shrink-0 transition-[opacity,transform] duration-150", active ? "opacity-100" : "opacity-0 group-hover/h:opacity-60")}
            strokeWidth={2}
          />
        </button>
      </th>
    );
  };

  return (
    <table className="w-full table-fixed border-collapse text-body-sm">
      <caption className="sr-only">The five funds. Column heads sort the table.</caption>
      <thead>
        <tr className="border-y border-line text-left text-caption">
          <th scope="col" className="py-2.5 pl-6 font-medium text-ink-3">
            Fund
          </th>
          {head("nav", "w-[96px]", <Term id="nav">NAV</Term>)}
          {head("coin", cn("w-[96px]", COL.coin), <Term id="fund-coin">Coin</Term>)}
          {head("premium", cn("w-[112px]", COL.premium), <Term id="premium">Premium</Term>)}
          {head("ret1d", "w-[92px]")}
          {head("vsSpy", cn("w-[96px]", COL.spy), <Term id="benchmark">vs SPY</Term>)}
          {head("reputation", cn("w-[112px]", COL.rep), <Term id="reputation">Reputation</Term>)}
          {head("outside", cn("w-[120px]", COL.outside))}
          {head("risk", cn("w-[112px]", COL.risk))}
          <th scope="col" className="w-10 py-2.5 pr-4">
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <AnimatedList as="tbody">
        {sorted.map((f, i) => (
          <Row key={f.id} f={f} index={i} />
        ))}
      </AnimatedList>
    </table>
  );
}

function Row({ f, index }: { f: FundRow; index: number }) {
  const link = useFundLink(f.id);
  const linkRef = useRef<HTMLAnchorElement>(null);
  return (
    <AnimatedItem
      as="tr"
      index={index}
      onClick={(e: MouseEvent) => forwardRowClick(e, link.href, linkRef.current)}
      onPointerEnter={link.onPointerEnter}
      className={cn(
        "group cursor-pointer border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-fill/70 active:bg-fill",
        "has-[a:focus-visible]:bg-fill has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-brand",
      )}
    >
      <td className="py-2 pl-6">
        <div className="flex min-w-0 items-center gap-3">
          <FundMark fund={f.id} size={32} className="transition-transform duration-150 group-hover:scale-105" />
          <Link ref={linkRef} {...link} className="flex min-h-11 min-w-0 flex-col justify-center outline-none">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-ink">{f.name}</span>
              <StatusTag f={f} />
            </span>
            <span className="truncate text-caption text-ink-3">{fundCharacter(f.id, f.mandate).personality}</span>
          </Link>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <VividFlash value={f.nav}>
          <NumberRoll value={price(f.nav)} className="font-medium text-ink" />
        </VividFlash>
      </td>
      <td className={cn("px-3 py-2 text-right", COL.coin)}>
        <VividFlash value={f.coinPrice ?? 0}>
          <NumberRoll value={price(f.coinPrice)} className="text-ink" />
        </VividFlash>
      </td>
      <td className={cn("px-3 py-2 text-right", COL.premium)}>
        <PremiumChip premium={f.premium} />
      </td>
      <td className="px-3 py-2 text-right">
        <ChangeChip value={f.ret1d} size="sm" />
      </td>
      <td className={cn("num px-3 py-2 text-right", COL.spy, toneOf(f.vsSpy))}>{pp(f.vsSpy)}</td>
      <td className={cn("px-3 py-2", COL.rep)}>
        <span className="flex items-center justify-end gap-2">
          <ReputationGauge score={f.reputation} size={40} />
          <span className="num w-6 text-right font-medium text-ink">{Math.round(f.reputation)}</span>
        </span>
      </td>
      <td className={cn("px-3 py-2 text-right", COL.outside)}>
        <span className="flex flex-col items-end">
          <span className="num text-ink">{pct(f.outsideHolders).replace("+", "")}</span>
          <span className="num text-caption text-ink-3">
            {f.holderCount} {f.holderCount === 1 ? "investor" : "investors"}
          </span>
        </span>
      </td>
      <td className={cn("px-3 py-2 text-right", COL.risk)}>
        <RiskBadge fund={f.id} mandate={f.mandate} short />
      </td>
      <td className="py-2 pr-4 text-ink-3">
        <ChevronRight className="size-4 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.5} aria-hidden />
      </td>
    </AnimatedItem>
  );
}

function PhoneRow({ f }: { f: FundRow }) {
  const link = useFundLink(f.id);
  return (
    <Link
      {...link}
      className="flex items-center gap-3 px-5 py-3 outline-none transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand active:bg-fill"
    >
      <FundMark fund={f.id} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-body-sm font-medium text-ink">{f.name}</span>
          <RiskBadge fund={f.id} mandate={f.mandate} short />
        </span>
        <span className="flex min-w-0 items-center gap-2 text-caption text-ink-3">
          <span>vs SPY</span>
          <span className={cn("num", toneOf(f.vsSpy))}>{pp(f.vsSpy)}</span>
          <span aria-hidden>·</span>
          <PremiumChip premium={f.premium} />
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <VividFlash value={f.nav}>
          <NumberRoll value={price(f.nav)} className="text-body-sm font-medium text-ink" />
        </VividFlash>
        <ChangeChip value={f.ret1d} size="sm" />
      </span>
    </Link>
  );
}

export function FundsTableSkeleton() {
  return (
    <div aria-hidden>
      <div className="hidden md:block">
        <div className="h-11 border-y border-line" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex h-[61px] items-center gap-4 border-b border-line px-6 last:border-b-0">
            <Skeleton className="size-8 rounded-[8px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="hidden h-6 w-20 rounded-full lg:block" />
          </div>
        ))}
      </div>
      <div className="flex flex-col divide-y divide-line md:hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex h-[68px] items-center gap-3 px-5">
            <Skeleton className="size-10 rounded-[10px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
