import type { ReactNode } from "react";

function Art({ children, size = 56 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="var(--ink)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const Dot = ({ cx, cy, r = 2.5 }: { cx: number; cy: number; r?: number }) => <circle cx={cx} cy={cy} r={r} fill="var(--brand)" stroke="none" />;

export const LINE_ICONS = {
  market: (
    <Art>
      <path d="M6 40h36" />
      <path d="M10 40V24M18 40V18M26 40V26M34 40V14" />
      <path d="M8 20l9-7 8 6 12-11" />
      <Dot cx={37} cy={8} />
    </Art>
  ),
  portfolio: (
    <Art>
      <circle cx="24" cy="25" r="15" />
      <path d="M24 10v15h15" />
      <path d="M24 25l-9 11" />
      <Dot cx={33} cy={16} />
    </Art>
  ),
  activity: (
    <Art>
      <path d="M5 26h8l4-10 7 20 5-14 3 4h11" />
      <circle cx="24" cy="24" r="19" strokeDasharray="2 4" />
      <Dot cx={43} cy={26} />
    </Art>
  ),
  jobs: (
    <Art>
      <rect x="11" y="7" width="26" height="34" rx="4" />
      <path d="M17 16h14M17 22h14M17 28h8" />
      <Dot cx={31} cy={34} />
    </Art>
  ),
  holders: (
    <Art>
      <circle cx="18" cy="17" r="6" />
      <path d="M7 38c1.5-7 6-10 11-10s9.5 3 11 10" />
      <circle cx="33" cy="19" r="4.5" />
      <path d="M31 28.5c4.5 0 8 2.5 9.5 8" />
      <Dot cx={33} cy={19} r={2} />
    </Art>
  ),
  votes: (
    <Art>
      <rect x="9" y="22" width="30" height="18" rx="3" />
      <path d="M17 22l3-13h8l3 13" />
      <path d="M18 31h12" />
      <Dot cx={24} cy={14} />
    </Art>
  ),
  letters: (
    <Art>
      <rect x="7" y="12" width="34" height="24" rx="3" />
      <path d="M8 14l16 12 16-12" />
      <Dot cx={38} cy={12} />
    </Art>
  ),
  receipts: (
    <Art>
      <path d="M13 6h22v36l-4-3-3.5 3-3.5-3-3.5 3-3.5-3-4 3z" />
      <path d="M18 15h12M18 21h12M18 27h7" />
      <Dot cx={30} cy={27} />
    </Art>
  ),
  studio: (
    <Art>
      <path d="M24 6c6 5 9 12 8 21l-4 5h-8l-4-5c-1-9 2-16 8-21z" />
      <path d="M16 27l-5 5 1 6 6-3M32 27l5 5-1 6-6-3" />
      <path d="M21 36v5M27 36v5" />
      <Dot cx={24} cy={18} />
    </Art>
  ),
  auctions: (
    <Art>
      <path d="M14 18l10-10 8 8-10 10z" />
      <path d="M22 22l14 14" />
      <path d="M8 40h18" />
      <Dot cx={36} cy={36} />
    </Art>
  ),
  index: (
    <Art>
      <path d="M7 41h34M7 41V7" />
      <path d="M13 33l7-8 6 4 12-14" strokeDasharray="3 3" />
      <Dot cx={38} cy={15} />
    </Art>
  ),
  search: (
    <Art>
      <circle cx="21" cy="21" r="12" />
      <path d="M30 30l10 10" />
      <Dot cx={21} cy={21} />
    </Art>
  ),
  key: (
    <Art>
      <circle cx="17" cy="24" r="8" />
      <path d="M25 24h17M36 24v6M41 24v4" />
      <Dot cx={17} cy={24} />
    </Art>
  ),
  offline: (
    <Art>
      <path d="M8 19c9-8 23-8 32 0M13 25c6-5 16-5 22 0M18 31c3-2.5 9-2.5 12 0" />
      <path d="M8 8l32 32" />
      <Dot cx={24} cy={37} />
    </Art>
  ),
  bell: (
    <Art>
      <path d="M14 33V22a10 10 0 0 1 20 0v11l3 4H11z" />
      <path d="M21 41a3 3 0 0 0 6 0" />
      <Dot cx={24} cy={9} />
    </Art>
  ),
} as const;

export type LineIconName = keyof typeof LINE_ICONS;
