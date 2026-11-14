"use client";

import type { Move } from "@listed/shared";
import { NumberRoll } from "@/components/ui/number-roll";
import { cn } from "@/lib/cn";
import { useClock } from "../../lib/use-clock";
import { diffLabel, fmtAgo, fmtCountdown, headlineDiffs, secondsUntil } from "../data/logic";
import { BellGlyph, FundMark } from "../ui/atoms";

export function NextBellCard({ nextBellAt, bellSecs }: { nextBellAt: string; bellSecs: number }) {
  const now = useClock();
  const left = secondsUntil(nextBellAt, now);
  const size = 40;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const f = left === null ? 0 : 1 - Math.min(1, left / bellSecs);
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-paper py-2.5 pl-2.5 pr-4 shadow-[var(--v4-shadow-float)]">
      <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gold-soft)" strokeWidth="3" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - f)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <BellGlyph size={16} className="v4-bell-wobble absolute text-gold" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Next rebalance bell</div>
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="v4-num text-[18px] font-medium tracking-[-0.02em] text-ink">
            {left === null ? "--:--" : <NumberRoll value={fmtCountdown(left)} duration={500} rollOnMount={false} label={`${left} seconds`} />}
          </span>
          <span className="text-[12px] text-ink-3">5 funds reveal</span>
        </div>
      </div>
    </div>
  );
}

export function RevealCard({ move }: { move: Move }) {
  const now = useClock();
  const diffs = headlineDiffs(move, 3);
  return (
    <div className="w-[288px] rounded-[20px] bg-paper p-3.5 shadow-[var(--v4-shadow-float)]">
      <div className="flex items-center gap-2.5">
        <FundMark id={move.fund} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Latest reveal</div>
          <div className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
            {move.fundName} <span className="font-normal text-ink-3">· bell #{move.bell}</span>
          </div>
        </div>
        <span className="text-[11px] text-ink-3">{fmtAgo(move.at, now)}</span>
      </div>
      {diffs.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {diffs.map((d) => (
            <span
              key={d.asset}
              className={cn(
                "v4-num inline-flex h-6 items-center rounded-full px-2 text-[11.5px] font-medium",
                d.kind === "exit" || d.delta < 0 ? "bg-down-soft text-down" : "bg-up-soft text-up",
              )}
            >
              {diffLabel(d)}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] text-ink-3">Held every weight this bell.</p>
      )}
      {move.note ? <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-[18px] text-ink-2">“{move.note}”</p> : null}
    </div>
  );
}
