import type { FundId } from "@listed/shared";
import { A, DOWN, GOLD, GOLD_TEXT, INK, PAPER, UP, fundTheme } from "./palette";
import { trophyCup } from "./shapes";
import {
  approxWidth,
  day,
  document,
  drixieLockup,
  finite,
  fundMark,
  halftoneFade,
  halftoneRings,
  idFrom,
  pill,
  rule,
  shortAccount,
  signedPct,
  text,
  type RenderOptions,
} from "./svg";

export interface TrophyData {
  season: number;
  fund: FundId;
  name: string;

  holder?: string | null;
  owner?: string | null;

  retSeasonPct?: number | null;

  vsSpyPp?: number | null;

  score?: number | null;

  at?: string | number | null;
  mintedAt?: string | number | null;
}

export const TROPHY_W = 800;
export const TROPHY_H = 1000;

export function renderTrophy(input: TrophyData, opts: RenderOptions = {}): string {
  const d = {
    ...input,
    holder: input.holder ?? input.owner ?? null,
    retSeasonPct: finite(input.retSeasonPct),
    vsSpyPp: finite(input.vsSpyPp),
    score: finite(input.score),
    at: input.at ?? input.mintedAt ?? null,
  };
  const theme = fundTheme(d.fund);
  const id = opts.idPrefix ?? idFrom(`trophy|${d.season}|${d.fund}`);
  const W = TROPHY_W;
  const cx = W / 2;
  const parts: string[] = [];

  parts.push(`<rect width="${W}" height="520" fill="${theme.pastel}" fill-opacity="0.55" data-art="band"/>`);
  parts.push(halftoneFade(0, W, 520, 6, 11, theme.pastel, 4.6, 0.9));
  parts.push(halftoneRings(cx, 284, 150, 7, 16, GOLD, 3.4, 0.9, 0.55));
  parts.push(`<circle cx="${cx}" cy="284" r="136" fill="${PAPER}"/>`);
  parts.push(trophyCup(cx, 286, 0.92, GOLD, GOLD_TEXT, INK));

  const seasonLabel = `Season ${d.season}`;
  const sw = approxWidth(seasonLabel, 16) + 32;
  parts.push(pill(48 + sw / 2, 48, seasonLabel, { size: 16, padX: 16, height: 40 }));
  const tw = approxWidth("Trophy", 16) + 32;
  parts.push(pill(W - 48 - tw / 2, 48, "Trophy", { size: 16, padX: 16, height: 40, color: GOLD_TEXT }));

  parts.push(text(cx, 590, "Manager of the Year", { size: 17, weight: 600, anchor: "middle", fill: GOLD_TEXT, track: 0.12, upper: true }));
  parts.push(text(cx, 660, seasonLabel, { size: 72, weight: 600, anchor: "middle", track: -0.03 }));
  const nameW = approxWidth(d.name, 30) + 48 + 14;
  const nx = cx - nameW / 2;
  parts.push(fundMark(d.fund, nx, 690, 48, theme.deep));
  parts.push(text(nx + 62, 724, d.name, { size: 30, weight: 600, track: -0.02 }));

  const py = 772;
  const ph = 104;
  const px = 48;
  const pw = W - 96;
  parts.push(`<rect x="${px + 0.5}" y="${py + 0.5}" width="${pw - 1}" height="${ph - 1}" rx="20" fill="${PAPER}" stroke="${INK}" stroke-opacity="${A.line}"/>`);
  const third = pw / 3;
  parts.push(`<path d="M${px + third + 0.5} ${py + 20}V${py + ph - 20}M${px + 2 * third + 0.5} ${py + 20}V${py + ph - 20}" stroke="${INK}" stroke-opacity="${A.line}"/>`);
  const stat = (i: number, label: string, value: string, fill: string) =>
    text(px + third * i + third / 2, py + 40, label, { size: 14, anchor: "middle", opacity: A.ink2 }) +
    text(px + third * i + third / 2, py + 80, value, { size: 28, weight: 600, mono: true, anchor: "middle", fill });
  const dir = (v: number | null) => (v === null || Math.abs(v) < 0.05 ? INK : v > 0 ? UP : DOWN);
  parts.push(stat(0, "Season return", d.retSeasonPct === null ? "—" : signedPct(d.retSeasonPct), dir(d.retSeasonPct)));
  parts.push(stat(1, "vs SPY", d.vsSpyPp === null ? "—" : signedPct(d.vsSpyPp, " pts"), dir(d.vsSpyPp)));
  parts.push(stat(2, "Score", d.score === null ? "—" : String(Math.round(d.score)), INK));

  parts.push(rule(48, W - 48, 908));
  parts.push(drixieLockup(48, 932, 24).svg);
  const when = d.at === null ? null : day(d.at);
  const right = d.holder ? [shortAccount(d.holder, 24), when].filter(Boolean).join(" · ") : when ? `Awarded ${when}` : "Drixie trophy";
  parts.push(text(W - 48, 950, right, { size: 13, mono: Boolean(d.holder), anchor: "end", opacity: A.ink3 }));

  return document(
    {
      width: W,
      height: TROPHY_H,
      title: `Manager of the Year — Season ${d.season}: ${d.name}`,
      desc: `Drixie trophy: ${d.name} won season ${d.season}${d.retSeasonPct === null ? "" : ` with ${signedPct(d.retSeasonPct)}`}.${d.holder ? ` Awarded to ${d.holder}.` : ""}`,
      body: parts.join(""),
      opts,
    },
    `${id}-clip`,
  );
}
