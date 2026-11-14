import type { FundBadge, FundId } from "@listed/shared";
import { A, BRAND, DOWN, GOLD, GOLD_TEXT, INK, PAPER, PASTEL, VIZ, fundTheme, tint } from "./palette";
import { badgeKind } from "./chain";
import { trophyCup } from "./shapes";
import {
  approxWidth,
  day,
  document,
  drixieLockup,
  finite,
  fundMark,
  idFrom,
  n,
  shortAccount,
  text,
  type RenderOptions,
} from "./svg";

export type BadgeKind = FundBadge["kind"];

export interface BadgeData {

  kind: BadgeKind;
  fund: FundId | null;

  fundName?: string | null;
  name?: string | null;
  season?: number | null;

  holder?: string | null;
  owner?: string | null;
  mintedAt?: string | number | null;

  rank?: number | null;
}

export const BADGE_W = 800;
export const BADGE_H = 800;

const CHAMPAGNE = tint(GOLD, 0.8);
const TEAL_DEEP = VIZ.teal;

export const BADGE_KINDS: Record<BadgeKind, { title: string; pastel: string; deep: string; line: string }> = {
  season_winner: { title: "Backed the winner", pastel: CHAMPAGNE, deep: GOLD, line: "Held the fund that won the season." },
  black_swan: { title: "Held through a black-swan day", pastel: PASTEL.lavender, deep: INK, line: "Stayed in when the market shock hit." },
  early_backer: { title: "Early backer", pastel: PASTEL.sky, deep: BRAND, line: "One of the first 100 backers of the fund." },
  kept_faith: { title: "Kept faith", pastel: PASTEL.mint, deep: VIZ.teal, line: "Held through a reputation dip until it recovered." },
};

const CX = 400;
const CY = 300;
const RIM = 16;

function rimMark(fund: FundId | null, y: number, rim: string): string {
  if (!fund) return "";
  const s = 56;
  return (
    `<rect x="${CX - s / 2 - 6}" y="${y - s / 2 - 6}" width="${s + 12}" height="${s + 12}" rx="20" fill="${rim}"/>` +
    fundMark(fund, CX - s / 2, y - s / 2, s, fundTheme(fund).deep, { border: false })
  );
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function laurel(cx: number, cy: number, R: number, tone: string): string {
  const out: string[] = [];
  const at = (deg: number, r = R) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))] as const;
  const [sx, sy] = at(102);
  const [ex, ey] = at(238);

  out.push(`<path d="M${n(sx)} ${n(sy)}A${R} ${R} 0 0 1 ${n(ex)} ${n(ey)}" fill="none" stroke="${tone}" stroke-width="5" stroke-linecap="round"/>`);
  out.push(`<path d="M${n(2 * cx - sx)} ${n(sy)}A${R} ${R} 0 0 0 ${n(2 * cx - ex)} ${n(ey)}" fill="none" stroke="${tone}" stroke-width="5" stroke-linecap="round"/>`);
  for (let i = 0; i < 8; i++) {
    const deg = 112 + i * 17;
    const [px, py] = at(deg);
    const tangent = deg + 90;
    for (const side of [-1, 1]) {
      const r = tangent + side * 38;
      const lx = px + 15 * Math.cos(rad(r));
      const ly = py + 15 * Math.sin(rad(r));
      out.push(`<ellipse cx="${n(lx)}" cy="${n(ly)}" rx="17" ry="7.5" transform="rotate(${n(r)} ${n(lx)} ${n(ly)})"/>`);
      const mx = 2 * cx - lx;
      out.push(`<ellipse cx="${n(mx)}" cy="${n(ly)}" rx="17" ry="7.5" transform="rotate(${n(180 - r)} ${n(mx)} ${n(ly)})"/>`);
    }
  }
  const [tx, ty] = at(244);
  out.push(`<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="15" ry="7" transform="rotate(${n(244 + 90)} ${n(tx)} ${n(ty)})"/>`);
  out.push(`<ellipse cx="${n(2 * cx - tx)}" cy="${n(ty)}" rx="15" ry="7" transform="rotate(${n(180 - 244 - 90)} ${n(2 * cx - tx)} ${n(ty)})"/>`);
  return `<g fill="${tone}">${out.join("")}</g>`;
}

function winnerEmblem(rim: string, season: number | null): string {
  const shield = "M226 116Q400 74 574 116V286C574 398 498 470 400 516C302 470 226 398 226 286Z";
  const inset = `transform="translate(${CX} ${CY}) scale(0.9) translate(${-CX} ${-CY})"`;
  const ribbon = season
    ? `<path d="M296 420H504L490 440L504 460H296L310 440Z" fill="${GOLD_TEXT}"/>` +
      `<rect x="318" y="414" width="164" height="40" rx="6" fill="${GOLD}"/>` +
      text(CX, 441, `Season ${season}`, { size: 19, weight: 600, anchor: "middle", fill: PAPER, track: 0.08, upper: true })
    : "";
  return (
    `<path d="${shield}" fill="${CHAMPAGNE}" stroke="${rim}" stroke-width="${RIM}" stroke-linejoin="round"/>` +
    `<path d="${shield}" ${inset} fill="none" stroke="${GOLD}" stroke-width="3"/>` +
    laurel(CX, 296, 118, GOLD) +
    trophyCup(CX, 292, 0.5, GOLD, GOLD_TEXT, GOLD_TEXT) +
    ribbon
  );
}

function swanEmblem(rim: string): string {
  const R = 216;
  const pts = [0, 60, 120, 180, 240, 300].map((d) => `${n(CX + R * Math.cos(rad(d)))} ${n(CY + R * Math.sin(rad(d)))}`);
  const hex = `M${pts.join("L")}Z`;
  const inset = `transform="translate(${CX} ${CY}) scale(0.9) translate(${-CX} ${-CY})"`;

  const rain = [
    [262, 160],
    [300, 150],
    [338, 162],
    [244, 206],
    [282, 198],
    [320, 208],
  ]
    .map(([x, y]) => `<path d="M${x} ${y}l-14 30" stroke="${INK}" stroke-opacity="0.42" stroke-width="5" stroke-linecap="round"/>`)
    .join("");
  const wave = (y: number, x0: number, x1: number, op: number) => {
    let d = `M${x0} ${y}`;
    for (let x = x0; x < x1; x += 40) d += `q10 -10 20 0t20 0`;
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-opacity="${op}" stroke-width="5" stroke-linecap="round"/>`;
  };
  const bolt = `<path d="M524 136L482 208H510L478 272L552 186H518L548 136Z" fill="${PASTEL.lime}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;

  const swan =
    `<g transform="translate(282 232)">` +
    `<path d="M24 132C24 168 82 186 142 184C196 182 230 154 238 112C220 126 200 130 182 124C176 100 152 90 128 96C100 104 84 122 58 126C44 128 32 128 24 132Z" fill="${INK}"/>` +
    `<path d="M96 116C112 70 166 52 214 70C186 84 166 100 154 124Z" fill="${INK}"/>` +
    `<path d="M120 106C140 86 168 78 196 80" fill="none" stroke="${PASTEL.lavender}" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M66 130C52 98 74 74 70 52C66 32 46 28 38 42" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>` +
    `<circle cx="42" cy="38" r="12" fill="${INK}"/>` +
    `<path d="M33 33L10 46L36 47Z" fill="${DOWN}"/>` +
    `<circle cx="44" cy="35" r="2.6" fill="${PAPER}"/>` +
    `</g>`;
  return (
    `<path d="${hex}" fill="${PASTEL.lavender}" stroke="${rim}" stroke-width="${RIM}" stroke-linejoin="round"/>` +
    `<path d="${hex}" ${inset} fill="none" stroke="${INK}" stroke-opacity="0.32" stroke-width="3"/>` +
    rain +
    bolt +
    wave(430, 262, 538, 0.55) +
    wave(452, 300, 500, 0.32) +
    swan
  );
}

function ticketEmblem(rim: string, rank: number | null): string {
  const t =
    "M168 130H632A28 28 0 0 0 660 158V270A30 30 0 0 0 660 330V442A28 28 0 0 0 632 470H168" +
    "A28 28 0 0 0 140 442V330A30 30 0 0 0 140 270V158A28 28 0 0 0 168 130Z";
  const sky = PASTEL.sky;

  const sunCx = 300;
  const hz = 372;
  const rays = [200, 225, 250, 270, 290, 315, 340]
    .map((d) => {
      const a = rad(d);
      return `<path d="M${n(sunCx + 84 * Math.cos(a))} ${n(hz + 84 * Math.sin(a))}L${n(sunCx + 112 * Math.cos(a))} ${n(hz + 112 * Math.sin(a))}" stroke="${BRAND}" stroke-width="7" stroke-linecap="round"/>`;
    })
    .join("");
  const sun =
    `<path d="M${sunCx - 70} ${hz}A70 70 0 0 1 ${sunCx + 70} ${hz}Z" fill="${BRAND}"/>` +
    rays +
    `<path d="M176 ${hz}H468" stroke="${BRAND}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M206 ${hz + 24}H438M240 ${hz + 46}H404" stroke="${BRAND}" stroke-opacity="0.45" stroke-width="6" stroke-linecap="round"/>`;

  const trail = `<path d="M196 330C250 300 320 262 392 222" fill="none" stroke="${BRAND}" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 14"/>`;
  const rocket =
    `<g transform="translate(414 202) rotate(52)">` +
    `<path d="M0 -40C16 -26 18 4 12 22H-12C-18 4 -16 -26 0 -40Z" fill="${BRAND}"/>` +
    `<circle cx="0" cy="-10" r="7" fill="${PAPER}"/>` +
    `<path d="M-12 8L-24 28L-10 24ZM12 8L24 28L10 24Z" fill="${BRAND}"/>` +
    `<path d="M-8 24L0 44L8 24Z" fill="${PASTEL.lime}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `</g>`;

  const perf = `<path d="M500 150V450" stroke="${PAPER}" stroke-width="9" stroke-linecap="round" stroke-dasharray="0.1 18"/>`;
  const stub = rank
    ? text(572, 318, `#${rank}`, { size: rank >= 100 ? 40 : 48, weight: 600, mono: true, anchor: "middle", fill: BRAND, track: -0.04 }) +
      text(572, 350, "of 100", { size: 20, weight: 500, anchor: "middle", fill: BRAND, opacity: 0.72 })
    : text(572, 284, "First", { size: 24, weight: 600, anchor: "middle", fill: BRAND }) +
      text(572, 338, "100", { size: 44, weight: 600, mono: true, anchor: "middle", fill: BRAND, track: -0.04 });
  const admit = text(572, 196, "Admit one", { size: 13, weight: 600, anchor: "middle", fill: BRAND, opacity: 0.72, track: 0.12, upper: true });
  return (
    `<path d="${t}" fill="${sky}" stroke="${rim}" stroke-width="${RIM}" stroke-linejoin="round"/>` +
    trail +
    sun +
    rocket +
    perf +
    admit +
    stub
  );
}

function faithEmblem(rim: string): string {
  const R = 212;

  const line =
    `<path d="M214 360L268 372L316 404L372 330L428 300L486 236L564 186" fill="none" stroke="${VIZ.teal}" stroke-opacity="0.38" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="564" cy="186" r="13" fill="${VIZ.teal}"/>` +
    `<circle cx="316" cy="404" r="10" fill="${PASTEL.mint}" stroke="${VIZ.teal}" stroke-width="5"/>`;
  const a = TEAL_DEEP;
  const anchor =
    `<g stroke="${a}" stroke-linecap="round" fill="none">` +
    `<circle cx="400" cy="174" r="20" stroke-width="12"/>` +
    `<path d="M400 194V420" stroke-width="16"/>` +
    `<path d="M344 236H456" stroke-width="14"/>` +
    `<path d="M300 334C306 392 346 424 400 426C454 424 494 392 500 334" stroke-width="15"/>` +
    `</g>` +
    `<path d="M282 344L300 312L320 344Z" fill="${a}"/>` +
    `<path d="M480 344L500 312L518 344Z" fill="${a}"/>` +
    `<circle cx="400" cy="236" r="9" fill="${a}"/>`;
  return (
    `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${PASTEL.mint}" stroke="${rim}" stroke-width="${RIM}"/>` +
    `<circle cx="${CX}" cy="${CY}" r="${R - 22}" fill="none" stroke="${VIZ.teal}" stroke-opacity="0.45" stroke-width="3"/>` +
    line +
    anchor
  );
}

const RIM_TOP: Record<BadgeKind, number> = { season_winner: 95, black_swan: 113, early_backer: 130, kept_faith: 88 };

export function renderBadge(input: BadgeData, opts: RenderOptions = {}): string {
  const kind = badgeKind(String(input.kind));
  if (!kind) throw new RangeError(`unknown badge kind ${String(input.kind)}`);
  const d = {
    ...input,
    kind,
    fundName: input.fundName ?? (input.fund ? input.name : null) ?? null,
    holder: input.holder ?? input.owner ?? null,
    season: finite(input.season),
    rank: finite(input.rank),
    mintedAt: input.mintedAt ?? null,
  };
  const k = BADGE_KINDS[kind];
  const id = opts.idPrefix ?? idFrom(`badge|${d.kind}|${d.fund ?? ""}|${d.season ?? ""}|${d.holder ?? ""}`);
  const W = BADGE_W;
  const cx = W / 2;
  const rim = d.fund ? fundTheme(d.fund).deep : VIZ.slate;
  const parts: string[] = [];

  parts.push(`<rect width="${W}" height="540" fill="${k.pastel}" fill-opacity="0.28"/>`);
  if (d.kind === "season_winner") parts.push(winnerEmblem(rim, d.season));
  else if (d.kind === "black_swan") parts.push(swanEmblem(rim));
  else if (d.kind === "early_backer") parts.push(ticketEmblem(rim, d.rank && d.rank > 0 ? Math.round(d.rank) : null));
  else parts.push(faithEmblem(rim));
  parts.push(rimMark(d.fund, RIM_TOP[d.kind], rim));

  parts.push(text(cx, 590, k.title, { size: 34, weight: 600, anchor: "middle", track: -0.02 }));

  const who = [d.fundName, d.season ? `Season ${d.season}` : null].filter(Boolean).join(" · ") || k.line;
  const markSize = d.fund ? 28 : 0;
  const gap = d.fund ? 10 : 0;
  const ww = approxWidth(who, 19) + markSize + gap;
  const x0 = cx - ww / 2;
  if (d.fund) parts.push(fundMark(d.fund, x0, 614, markSize, fundTheme(d.fund).deep));
  parts.push(text(x0 + markSize + gap, 635, who, { size: 19, weight: 500, opacity: A.ink2 }));

  const meta = d.mintedAt === null ? "Soulbound" : `Soulbound · minted ${day(d.mintedAt)}`;
  parts.push(text(cx, 676, meta, { size: 15, anchor: "middle", opacity: A.ink3 }));
  if (d.holder) parts.push(text(cx, 700, shortAccount(d.holder, 34), { size: 15, mono: true, anchor: "middle", opacity: A.ink2 }));

  parts.push(drixieLockup(48, 732, 22).svg);
  parts.push(text(W - 48, 748, "Investor badge", { size: 13, weight: 600, anchor: "end", opacity: A.ink3, track: 0.08, upper: true }));

  return document(
    {
      width: W,
      height: BADGE_H,
      title: `${k.title}${d.fundName ? ` · ${d.fundName}` : ""}`,
      desc: `Drixie investor badge (soulbound): ${k.title}. ${k.line}${d.holder ? ` Held by ${d.holder}.` : ""}`,
      body: parts.join(""),
      opts,
    },
    `${id}-clip`,
  );
}
