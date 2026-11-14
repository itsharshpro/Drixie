import { cn } from "@/lib/cn";
import { fundColorVar } from "@/lib/funds/meta";
import { glyphDots } from "./company-glyph";

const G: Record<string, string[]> = {
  atlas: ["...#...", "..###..", ".#####.", ".#.#.#.", ".#.#.#.", ".#.#.#.", "#######"],
  meridian: ["..###..", ".#.#.#.", "#..#..#", "#######", "#..#..#", ".#.#.#.", "..###.."],
  nova: ["#..#..#", ".#.#.#.", "..###..", "###.###", "..###..", ".#.#.#.", "#..#..#"],
  orion: [".#...#.", "..#.#..", ".......", "..###..", ".......", "..#.#..", ".#...#."],
  kite: ["...#...", "..###..", ".#####.", "..###..", "...#...", "....#..", ".....##"],
};

const BIG = new Set(["orion"]);

export interface GlyphDot {
  cx: number;
  cy: number;
  r: number;
}

export function fundGlyphDots(fund: string, box: number): GlyphDot[] {
  const rows = G[fund.toLowerCase()];
  if (!rows) {
    const { r, dots } = glyphDots(`F:${fund.toUpperCase()}`, box);
    return dots.map(([cx, cy]) => ({ cx, cy, r }));
  }
  const n = rows.length;
  const pitch = box / n;
  const r = pitch * (BIG.has(fund.toLowerCase()) ? 0.5 : 0.4);
  const out: GlyphDot[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") out.push({ cx: pitch * (x + 0.5), cy: pitch * (y + 0.5), r });
  });
  return out;
}

export function FundGlyph({ fund, box, color, className }: { fund: string; box: number; color?: string; className?: string }) {
  const dots = fundGlyphDots(fund, box);
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className={cn("block shrink-0", className)} aria-hidden>
      <g fill={color ?? fundColorVar(fund)}>
        {dots.map((d, i) => (
          <circle key={i} className="fund-glyph-dot" style={{ ["--i" as string]: i }} cx={d.cx} cy={d.cy} r={d.r} />
        ))}
      </g>
    </svg>
  );
}

export type FundMarkSize = 24 | 32 | 40 | 56 | 72;
const MARK: Record<FundMarkSize, { radius: number; glyph: number }> = {
  24: { radius: 6, glyph: 15 },
  32: { radius: 8, glyph: 19 },
  40: { radius: 10, glyph: 24 },
  56: { radius: 14, glyph: 34 },
  72: { radius: 18, glyph: 44 },
};

function snap(size: number): FundMarkSize {
  return size <= 24 ? 24 : size <= 32 ? 32 : size <= 40 ? 40 : size <= 56 ? 56 : 72;
}

export function FundMark({ fund, size = 40, className }: { fund: string; size?: number; className?: string }) {
  const s = snap(size);
  const m = MARK[s];
  return (
    <span
      className={cn("fund-mark relative inline-flex shrink-0 select-none items-center justify-center border border-line bg-paper", className)}
      style={{ width: s, height: s, borderRadius: m.radius }}
      aria-hidden
    >
      <FundGlyph fund={fund} box={m.glyph} />
    </span>
  );
}

export function FundDot({ fund, className }: { fund: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: fundColorVar(fund) }} />;
}
