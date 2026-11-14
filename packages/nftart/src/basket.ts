import type { FundId } from "@listed/shared";
import { A, DOWN, INK, PAPER, UP, fundTheme, tint } from "./palette";
import {
  approxWidth,
  arrow,
  bpsPct,
  document,
  drixieLockup,
  fundMark,
  halftoneFade,
  idFrom,
  n,
  pill,
  price,
  rule,
  shortHash,
  signedPct,
  stamp,
  text,
  type RenderOptions,
} from "./svg";

export interface BasketHolding {

  asset: string;

  label?: string;
  bps: number;

  estimated?: boolean;

  delta?: number | null;

  entered?: boolean;
}

export interface BasketCardData {
  fund: FundId;
  name: string;

  mandate: string;
  edition: number;
  bell: number;

  at: string | number;

  nav: number;

  launchNav?: number;
  holdings: BasketHolding[];
  cashBps: number;
  pricesHash?: string | null;
  season?: number | null;
}

export const BASKET_W = 800;
export const BASKET_H = 1000;
const MAX_HOLDINGS = 10;

export function validateBasket(d: BasketCardData): void {
  if (d.holdings.length < 1 || d.holdings.length > MAX_HOLDINGS) throw new RangeError(`basket card needs 1-${MAX_HOLDINGS} holdings, got ${d.holdings.length}`);
  for (const h of [...d.holdings.map((x) => x.bps), d.cashBps]) {
    if (!Number.isInteger(h) || h < 0 || h > 10_000) throw new RangeError(`weights must be integer bps 0-10000, got ${h}`);
  }
  if (d.holdings.reduce((s, h) => s + h.bps, 0) + d.cashBps <= 0) throw new RangeError("basket card weights sum to 0");
  if (!Number.isInteger(d.edition) || d.edition < 0) throw new RangeError(`bad edition ${d.edition}`);
  if (!Number.isFinite(d.nav) || d.nav < 0) throw new RangeError(`bad nav ${d.nav}`);
}

function pt(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

export function ringPath(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const mid = a0 + Math.PI;
    return ringPath(cx, cy, R, r, a0, mid) + ringPath(cx, cy, R, r, mid, a0 + Math.PI * 2);
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [ox0, oy0] = pt(cx, cy, R, a0);
  const [ox1, oy1] = pt(cx, cy, R, a1);
  const [ix1, iy1] = pt(cx, cy, r, a1);
  const [ix0, iy0] = pt(cx, cy, r, a0);
  return `M${n(ox0)} ${n(oy0)}A${R} ${R} 0 ${large} 1 ${n(ox1)} ${n(oy1)}L${n(ix1)} ${n(iy1)}A${r} ${r} 0 ${large} 0 ${n(ix0)} ${n(iy0)}Z`;
}

function fit(label: string, size: number, maxW: number, mono = false): string {
  if (approxWidth(label, size, mono) <= maxW) return label;
  let s = label;
  while (s.length > 1 && approxWidth(`${s}…`, size, mono) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

export function renderBasketCard(d: BasketCardData, opts: RenderOptions = {}): string {
  validateBasket(d);
  const theme = fundTheme(d.fund);
  const id = opts.idPrefix ?? idFrom(`basket|${d.fund}|${d.edition}`);
  const W = BASKET_W;
  const X0 = 48;
  const X1 = W - 48;
  const holdings = [...d.holdings].sort((a, b) => b.bps - a.bps || (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0));
  const total = holdings.reduce((s, h) => s + h.bps, 0) + d.cashBps;
  const shade = (i: number) => tint(theme.deep, holdings.length === 1 ? 0 : (0.66 * i) / (holdings.length - 1));
  const parts: string[] = [];

  parts.push(`<rect width="${W}" height="212" fill="${theme.pastel}" data-art="band"/>`);
  parts.push(halftoneFade(0, W, 212, 6, 11, theme.pastel, 5, 0.9));
  parts.push(fundMark(d.fund, X0, 48, 72, theme.deep));
  parts.push(text(140, 88, fit(d.name, 40, 380), { size: 40, weight: 600, track: -0.02 }));
  parts.push(text(140, 120, fit(d.mandate, 18, 470), { size: 18, opacity: A.ink2 }));
  parts.push(text(X1, 70, "Basket card", { size: 13, weight: 600, anchor: "end", opacity: A.ink2, track: 0.08, upper: true }));
  const ed = `No. ${d.edition}`;
  const edW = approxWidth(ed, 22, true) + 32;
  parts.push(pill(X1 - edW / 2, 86, ed, { size: 22, mono: true, padX: 16, height: 44, weight: 600 }));

  const cx = W / 2;
  const cy = 452;
  const R = 168;
  const r = 110;
  let a = 0;
  const segs: string[] = [];
  const labels: string[] = [];
  holdings.forEach((h, i) => {
    const sweep = (h.bps / total) * Math.PI * 2;
    if (sweep <= 0) return;
    segs.push(`<path d="${ringPath(cx, cy, R, r, a, a + sweep)}" fill="${shade(i)}"/>`);
    if (sweep >= (14 * Math.PI) / 180) {
      const [lx, ly] = pt(cx, cy, (R + r) / 2, a + sweep / 2);
      const light = holdings.length > 1 && i / (holdings.length - 1) > 0.42;
      labels.push(text(lx, ly + 5, String(i + 1), { size: 15, weight: 600, mono: true, anchor: "middle", fill: light ? INK : PAPER }));
    }
    a += sweep;
  });
  if (d.cashBps > 0) segs.push(`<path d="${ringPath(cx, cy, R, r, a, Math.PI * 2)}" fill="${INK}" fill-opacity="0.07"/>`);
  parts.push(`<g stroke="${PAPER}" stroke-width="3" stroke-linejoin="round">${segs.join("")}</g>`);
  parts.push(labels.join(""));

  const navText = price(d.nav);
  const navSize = Math.min(46, Math.floor(186 / (navText.length * 0.6)));
  parts.push(text(cx, 406, "NAV per coin", { size: 14, weight: 500, anchor: "middle", opacity: A.ink2 }));
  parts.push(text(cx, 462, navText, { size: navSize, weight: 600, mono: true, anchor: "middle", track: -0.02 }));
  const launch = d.launchNav ?? 10;
  if (launch > 0) {
    const chg = (d.nav / launch - 1) * 100;
    const label = signedPct(chg);
    const flat = label === "0.0%";
    const tw = approxWidth(label, 17, true);
    const left = cx - (tw + (flat ? 0 : 18)) / 2;
    if (!flat) parts.push(arrow(left, 487, 12, chg > 0 ? "up" : "down"));
    parts.push(text(left + (flat ? 0 : 18), 499, label, { size: 17, weight: 600, mono: true, fill: flat ? INK : chg > 0 ? UP : DOWN }));
    parts.push(text(cx, 524, "since launch", { size: 14, anchor: "middle", opacity: A.ink3 }));
  }
  if (d.cashBps > 0) {
    const cash = `Cash ${bpsPct(d.cashBps)}`;
    const cw = approxWidth(cash, 15, true) + 22;
    parts.push(`<rect x="${n(cx - cw / 2)}" y="636" width="12" height="12" rx="3" fill="${INK}" fill-opacity="0.07"/>`);
    parts.push(text(cx - cw / 2 + 22, 647, cash, { size: 15, mono: true, opacity: A.ink2 }));
  }

  const listTop = 668;
  const rowH = 40;
  const colW = 328;
  const hasDelta = holdings.some((h) => h.entered || (h.delta !== undefined && h.delta !== null));
  holdings.forEach((h, i) => {
    const col = i < 5 ? 0 : 1;
    const row = i % 5;
    const x = col === 0 ? X0 : X1 - colW;
    const top = listTop + row * rowH;
    const base = top + 26;
    parts.push(text(x, base, String(i + 1).padStart(2, " "), { size: 13, mono: true, opacity: A.ink3 }));
    parts.push(`<rect x="${n(x + 24)}" y="${n(top + 13)}" width="14" height="14" rx="4" fill="${shade(i)}"/>`);
    const label = fit(h.label ?? h.asset, 17, hasDelta ? 150 : 200, true);
    parts.push(text(x + 48, base, label, { size: 17, weight: 600, mono: true }));
    if (h.estimated) parts.push(text(x + 48 + approxWidth(label, 17, true) + 8, base, "est.", { size: 13, opacity: A.ink3 }));
    const wx = hasDelta ? x + colW - 66 : x + colW;
    parts.push(text(wx, base, bpsPct(h.bps), { size: 17, mono: true, anchor: "end" }));
    if (h.entered) parts.push(text(x + colW, base, "new", { size: 13, weight: 600, anchor: "end", fill: theme.deep }));
    else if (h.delta) parts.push(text(x + colW, base, signedPct(h.delta / 100, ""), { size: 14, mono: true, anchor: "end", fill: h.delta > 0 ? UP : DOWN }));
    if (row < 4 && i + 1 < holdings.length) parts.push(rule(x, x + colW, top + rowH - 1));
  });

  parts.push(rule(X0, X1, 884));
  const left = d.season ? `Season ${d.season} · Bell ${d.bell}` : `Bell ${d.bell}`;
  parts.push(text(X0, 920, left, { size: 16, weight: 600, mono: true }));
  parts.push(text(X1, 920, stamp(d.at), { size: 15, anchor: "end", opacity: A.ink2 }));
  parts.push(drixieLockup(X0, 940, 22).svg);
  const fine = d.pricesHash ? `prices ${shortHash(d.pricesHash)}` : "simulation · real market prices";
  parts.push(text(X1, 956, fine, { size: 13, mono: true, anchor: "end", opacity: A.ink3 }));

  const weights = holdings.map((h) => `${h.label ?? h.asset} ${bpsPct(h.bps)}`).join(", ");
  return document(
    {
      width: W,
      height: BASKET_H,
      title: `${d.name} basket card No. ${d.edition}`,
      desc: `${d.name} portfolio at bell ${d.bell}: ${weights}${d.cashBps > 0 ? `, cash ${bpsPct(d.cashBps)}` : ""}. NAV ${price(d.nav)} per coin. A Drixie simulation priced off real markets.`,
      body: parts.join(""),
      opts,
    },
    `${id}-clip`,
  );
}

