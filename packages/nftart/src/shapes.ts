import { CANDLE_DOWN, CANDLE_UP, GOLD, GOLD_TEXT, INK, PAPER } from "./palette";
import { n } from "./svg";

function place(cx: number, cy: number, w: number, h: number, scale: number, body: string): string {
  return `<g transform="translate(${n(cx - (w * scale) / 2)} ${n(cy - (h * scale) / 2)}) scale(${Math.round(scale * 100000) / 100000})">${body}</g>`;
}

function star(cx: number, cy: number, R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${n(cx + rad * Math.cos(a))} ${n(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}

export function trophyCup(cx: number, cy: number, scale: number, tone = GOLD, dark = GOLD_TEXT, plinth = INK): string {
  const body =
    `<path d="M30 40H14C6 40 2 48 2 58C2 86 20 104 44 110" fill="none" stroke="${dark}" stroke-width="12" stroke-linecap="round"/>` +
    `<path d="M170 40H186C194 40 198 48 198 58C198 86 180 104 156 110" fill="none" stroke="${dark}" stroke-width="12" stroke-linecap="round"/>` +
    `<path d="M30 22H170V74C170 128 136 160 100 160C64 160 30 128 30 74Z" fill="${tone}"/>` +
    `<rect x="22" y="8" width="156" height="20" rx="7" fill="${dark}"/>` +
    `<path d="M54 40V76C54 106 66 126 82 136" fill="none" stroke="${PAPER}" stroke-opacity="0.32" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="${star(100, 84, 26, 11)}" fill="${PAPER}"/>` +
    `<rect x="88" y="158" width="24" height="32" fill="${dark}"/>` +
    `<rect x="58" y="186" width="84" height="16" rx="5" fill="${tone}"/>` +
    `<rect x="40" y="202" width="120" height="30" rx="8" fill="${plinth}"/>`;
  return place(cx, cy, 200, 236, scale, body);
}

export function swanCandles(cx: number, cy: number, scale: number): string {
  const candle = (x: number, wickTop: number, wickBot: number, top: number, bot: number, up: boolean) =>
    `<path d="M${x + 16} ${wickTop}V${wickBot}" stroke="${INK}" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>` +
    `<rect x="${x}" y="${top}" width="32" height="${bot - top}" rx="5" fill="${up ? CANDLE_UP : CANDLE_DOWN}"/>`;
  const body =
    `<path d="M0 178H220" stroke="${INK}" stroke-opacity="0.16" stroke-width="2" stroke-dasharray="4 6"/>` +
    candle(4, 34, 74, 42, 68, true) +
    candle(60, 22, 58, 28, 50, true) +
    candle(116, 18, 168, 26, 156, false) +
    candle(172, 70, 132, 80, 124, true);
  return place(cx, cy, 220, 180, scale, body);
}

export function faithLine(cx: number, cy: number, scale: number, tone: string): string {
  const body =
    `<path d="M0 44H220" stroke="${INK}" stroke-opacity="0.16" stroke-width="2" stroke-dasharray="4 6"/>` +
    `<path d="M8 40L48 50L84 112L112 130L146 84L178 52L212 30" fill="none" stroke="${tone}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="112" cy="130" r="12" fill="${PAPER}" stroke="${tone}" stroke-width="6"/>` +
    `<circle cx="212" cy="30" r="12" fill="${tone}"/>`;
  return place(cx, cy, 220, 150, scale, body);
}

export function sprout(cx: number, cy: number, scale: number, tone: string): string {
  const body =
    `<path d="M80 176V86" stroke="${tone}" stroke-width="12" stroke-linecap="round"/>` +
    `<path d="M80 100C80 58 50 34 8 34C8 78 36 104 80 100Z" fill="${tone}"/>` +
    `<path d="M80 84C80 40 112 8 152 8C152 54 124 86 80 84Z" fill="${tone}" fill-opacity="0.72"/>` +
    `<path d="M24 176H136" stroke="${INK}" stroke-opacity="0.16" stroke-width="2" stroke-dasharray="4 6"/>`;
  return place(cx, cy, 160, 180, scale, body);
}
