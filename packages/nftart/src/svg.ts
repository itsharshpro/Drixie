import { GEIST_MONO_WOFF2, GEIST_WOFF2 } from "./fonts.generated";
import { TILE, GLYPH, WORD, WORD_H, WORD_W } from "./brand";
import { markGlyph, GLYPH_N } from "./glyph";
import { A, BRAND, DOWN, INK, PAPER, UP } from "./palette";

export interface RenderOptions {

  fonts?: "embed" | "none";

  idPrefix?: string;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function n(x: number): string {
  const r = Math.round(x * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

function group3(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function price(x: number): string {
  const d = Math.abs(x) >= 1 ? 2 : 4;
  const [i, f] = Math.abs(x).toFixed(d).split(".") as [string, string];
  return `${x < 0 ? "−" : ""}$${group3(i)}.${f}`;
}

export function usdCompact(x: number): string {
  const v = Math.abs(x);
  const sign = x < 0 ? "−" : "";
  if (v >= 1e9) return `${sign}$${trim(v / 1e9, 2)}B`;
  if (v >= 1e6) return `${sign}$${trim(v / 1e6, 2)}M`;
  return `${sign}$${group3(String(Math.round(v)))}`;
}

function trim(x: number, d: number): string {
  return x.toFixed(d).replace(/\.?0+$/, "");
}

export function bpsPct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export function signedPct(pct: number, suffix = "%"): string {
  const v = Math.abs(pct).toFixed(1);
  if (v === "0.0") return `0.0${suffix}`;
  return `${pct > 0 ? "+" : "−"}${v}${suffix}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toDate(at: string | number): Date {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) throw new RangeError(`bad date: ${at}`);
  return d;
}

export function day(at: string | number): string {
  const d = toDate(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function stamp(at: string | number): string {
  const d = toDate(at);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day(at)} · ${hh}:${mm} UTC`;
}

export function shortAccount(a: string, max = 26): string {
  if (a.length <= max) return a;
  const keep = Math.floor((max - 1) / 2);
  return `${a.slice(0, keep)}…${a.slice(-keep)}`;
}

export function shortHash(h: string): string {
  return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

export function idFrom(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `dx${h.toString(36)}`;
}

export function finite(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export const SANS = "var(--font-geist-sans, Geist), Geist, ui-sans-serif, system-ui, sans-serif";
export const MONO = "var(--font-geist-mono, 'Geist Mono'), 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function fontFaces(mode: RenderOptions["fonts"]): string {
  if (mode === "none") return "";
  return (
    `<style>@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${GEIST_WOFF2}) format("woff2");font-weight:400 700}` +
    `@font-face{font-family:"Geist Mono";src:url(data:font/woff2;base64,${GEIST_MONO_WOFF2}) format("woff2");font-weight:400 700}</style>`
  );
}

export interface TextOpts {
  size: number;
  weight?: number;
  fill?: string;
  opacity?: number;
  anchor?: "start" | "middle" | "end";
  mono?: boolean;

  track?: number;
  upper?: boolean;
}

export function text(x: number, y: number, content: string, o: TextOpts): string {
  const attrs = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    `font-size="${o.size}"`,
    o.weight && o.weight !== 400 ? `font-weight="${o.weight}"` : "",
    `fill="${o.fill ?? INK}"`,
    o.opacity !== undefined && o.opacity < 1 ? `fill-opacity="${o.opacity}"` : "",
    o.anchor && o.anchor !== "start" ? `text-anchor="${o.anchor}"` : "",
    o.track ? `letter-spacing="${n(o.track * o.size)}"` : "",
    `style="font-family:${o.mono ? MONO : SANS}${o.mono ? ";font-variant-numeric:tabular-nums" : ""}"`,
  ].filter(Boolean);
  return `<text ${attrs.join(" ")}>${esc(o.upper ? content.toUpperCase() : content)}</text>`;
}

export function fundMark(id: string, x: number, y: number, size: number, deep: string, opts: { border?: boolean } = {}): string {
  const r = (size * 10) / 40;
  const pad = size * 0.2;
  const box = size - pad * 2;
  const pitch = box / GLYPH_N;
  const dot = pitch * 0.42;
  const dots: string[] = [];
  markGlyph(id).forEach((row, ry) =>
    row.forEach((on, rx) => {
      if (on) dots.push(`<circle cx="${n(x + pad + pitch * (rx + 0.5))}" cy="${n(y + pad + pitch * (ry + 0.5))}" r="${n(dot)}"/>`);
    }),
  );
  const border = opts.border === false ? "" : ` stroke="${INK}" stroke-opacity="${A.line}" stroke-width="1"`;
  return (
    `<g><rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${n(size - 1)}" height="${n(size - 1)}" rx="${n(r)}" fill="${PAPER}"${border}/>` +
    `<g fill="${deep}">${dots.join("")}</g></g>`
  );
}

export function drixieMark(x: number, y: number, size: number): string {
  const s = size / 64;
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${Math.round(s * 100000) / 100000})"><path d="${TILE}" fill="${BRAND}"/><path d="${GLYPH}" fill="${PAPER}" fill-rule="evenodd"/></g>`;
}

export function drixieLockup(x: number, y: number, size: number, color = INK): { svg: string; width: number } {
  const wh = size * 0.56;
  const gap = size * 0.31;
  const ws = wh / WORD_H;
  const wx = x + size + gap;
  const wy = y + (size - wh) / 2;
  const svg = `${drixieMark(x, y, size)}<g transform="translate(${n(wx)} ${n(wy)}) scale(${Math.round(ws * 100000) / 100000})"><path d="${WORD}" fill="${color}"/></g>`;
  return { svg, width: size + gap + WORD_W * ws };
}

export function halftoneFade(x0: number, x1: number, y0: number, rows: number, pitch: number, color: string, rMax: number, rMin: number): string {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0 : r / (rows - 1);
    const rad = rMax + (rMin - rMax) * t;
    const y = y0 + pitch * (r + 0.5);
    const off = r % 2 === 0 ? 0 : pitch / 2;
    for (let x = x0 + pitch / 2 + off; x < x1; x += pitch) out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}"/>`);
  }
  return `<g data-art="halftone" fill="${color}">${out.join("")}</g>`;
}

export function halftoneRings(cx: number, cy: number, r0: number, rings: number, pitch: number, color: string, rMax: number, rMin: number, opacity = 1): string {
  const out: string[] = [];
  for (let k = 0; k < rings; k++) {
    const t = rings === 1 ? 0 : k / (rings - 1);
    const rad = rMax + (rMin - rMax) * t;
    const R = r0 + pitch * k;
    const count = Math.max(6, Math.round((2 * Math.PI * R) / pitch));
    const phase = k % 2 === 0 ? 0 : Math.PI / count;
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * Math.PI * 2;
      out.push(`<circle cx="${n(cx + R * Math.cos(a))}" cy="${n(cy + R * Math.sin(a))}" r="${n(rad)}"/>`);
    }
  }
  return `<g data-art="halftone" fill="${color}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ""}>${out.join("")}</g>`;
}

export function arrow(x: number, y: number, size: number, dir: "up" | "down"): string {
  const h = size * 0.82;
  const p =
    dir === "up"
      ? `M${n(x)} ${n(y + h)}L${n(x + size / 2)} ${n(y)}L${n(x + size)} ${n(y + h)}Z`
      : `M${n(x)} ${n(y)}L${n(x + size / 2)} ${n(y + h)}L${n(x + size)} ${n(y)}Z`;
  return `<path d="${p}" fill="${dir === "up" ? UP : DOWN}"/>`;
}

export interface Doc {
  width: number;
  height: number;
  title: string;
  desc: string;
  body: string;
  opts: RenderOptions;

  defs?: string;
}

export function document(d: Doc, clipId: string, radius = 40): string {
  const { width: w, height: h } = d;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(d.title)}">` +
    `<title>${esc(d.title)}</title><desc>${esc(d.desc)}</desc>` +
    fontFaces(d.opts.fonts) +
    `<defs><clipPath id="${clipId}"><rect width="${w}" height="${h}" rx="${radius}"/></clipPath>${d.defs ?? ""}</defs>` +
    `<g clip-path="url(#${clipId})"><rect width="${w}" height="${h}" fill="${PAPER}"/>${d.body}</g>` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${radius - 0.5}" fill="none" stroke="${INK}" stroke-opacity="${A.line}"/>` +
    `</svg>`
  );
}

export function rule(x0: number, x1: number, y: number, opacity: number = A.line): string {
  return `<path d="M${n(x0)} ${n(y + 0.5)}H${n(x1)}" stroke="${INK}" stroke-opacity="${opacity}" stroke-width="1"/>`;
}

export function pill(cx: number, y: number, label: string, o: { size: number; mono?: boolean; fill?: string; color?: string; padX?: number; height?: number; weight?: number; stroke?: boolean }): string {
  const h = o.height ?? o.size * 2;
  const w = approxWidth(label, o.size, o.mono) + (o.padX ?? o.size) * 2;
  const stroke = o.stroke === false ? "" : ` stroke="${INK}" stroke-opacity="${A.line}"`;
  return (
    `<rect x="${n(cx - w / 2)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${o.fill ?? PAPER}"${stroke}/>` +
    text(cx, y + h / 2 + o.size * 0.35, label, { size: o.size, mono: o.mono, anchor: "middle", fill: o.color ?? INK, weight: o.weight ?? 500 })
  );
}

export function approxWidth(s: string, size: number, mono = false): number {
  if (mono) return s.length * size * 0.6;
  let w = 0;
  for (const ch of s) {
    if ("il.,:;|!'’ ".includes(ch)) w += 0.3;
    else if ("fjrt()[]-".includes(ch)) w += 0.4;
    else if ("mwMW@%".includes(ch)) w += 0.85;
    else if (ch >= "A" && ch <= "Z") w += 0.66;
    else w += 0.56;
  }
  return w * size;
}
