import { n } from "./svg";

export function shieldPath(cx: number, top: number, w: number, h: number): string {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const rc = Math.min(28, w * 0.08);
  const b = top + h;
  const knee = top + h * 0.42;
  return (
    `M${n(l)} ${n(top + rc)}Q${n(l)} ${n(top)} ${n(l + rc)} ${n(top)}` +
    `Q${n(cx)} ${n(top - h * 0.05)} ${n(r - rc)} ${n(top)}Q${n(r)} ${n(top)} ${n(r)} ${n(top + rc)}` +
    `L${n(r)} ${n(knee)}C${n(r)} ${n(top + h * 0.74)} ${n(cx + w * 0.24)} ${n(top + h * 0.9)} ${n(cx)} ${n(b)}` +
    `C${n(cx - w * 0.24)} ${n(top + h * 0.9)} ${n(l)} ${n(top + h * 0.74)} ${n(l)} ${n(knee)}Z`
  );
}

export function shieldInset(cx: number, top: number, w: number, h: number, i: number): string {
  return shieldPath(cx, top + i, w - 2 * i, h - i * 2.25);
}

export function roundedPolygon(pts: [number, number][], r: number): string {
  const out: string[] = [];
  const k = pts.length;
  for (let i = 0; i < k; i++) {
    const p = pts[i]!;
    const a = pts[(i - 1 + k) % k]!;
    const b = pts[(i + 1) % k]!;
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(r, da / 2) / da;
    const rb = Math.min(r, db / 2) / db;
    const s: [number, number] = [p[0] + (a[0] - p[0]) * ra, p[1] + (a[1] - p[1]) * ra];
    const e: [number, number] = [p[0] + (b[0] - p[0]) * rb, p[1] + (b[1] - p[1]) * rb];
    out.push(`${i === 0 ? "M" : "L"}${n(s[0])} ${n(s[1])}Q${n(p[0])} ${n(p[1])} ${n(e[0])} ${n(e[1])}`);
  }
  return `${out.join("")}Z`;
}

export function hexPath(cx: number, cy: number, R: number, corner: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return roundedPolygon(pts, corner);
}

export function ticketPath(l: number, t: number, w: number, h: number, px: number, notch: number, rc: number): string {
  const r = l + w;
  const b = t + h;
  return (
    `M${n(l + rc)} ${n(t)}L${n(px - notch)} ${n(t)}A${n(notch)} ${n(notch)} 0 0 0 ${n(px + notch)} ${n(t)}` +
    `L${n(r - rc)} ${n(t)}Q${n(r)} ${n(t)} ${n(r)} ${n(t + rc)}L${n(r)} ${n(b - rc)}Q${n(r)} ${n(b)} ${n(r - rc)} ${n(b)}` +
    `L${n(px + notch)} ${n(b)}A${n(notch)} ${n(notch)} 0 0 0 ${n(px - notch)} ${n(b)}` +
    `L${n(l + rc)} ${n(b)}Q${n(l)} ${n(b)} ${n(l)} ${n(b - rc)}L${n(l)} ${n(t + rc)}Q${n(l)} ${n(t)} ${n(l + rc)} ${n(t)}Z`
  );
}

export function annulus(cx: number, cy: number, R: number, r: number): string {
  const c = (rad: number) => `M${n(cx - rad)} ${n(cy)}A${n(rad)} ${n(rad)} 0 1 0 ${n(cx + rad)} ${n(cy)}A${n(rad)} ${n(rad)} 0 1 0 ${n(cx - rad)} ${n(cy)}Z`;
  return c(R) + c(r);
}

export function sunburst(cx: number, cy: number, R: number, count: number, rot = 0): string {
  const out: string[] = [];
  const step = (Math.PI * 2) / count;
  for (let i = 0; i < count; i += 2) {
    const a0 = rot + i * step;
    const a1 = a0 + step;
    out.push(`M${n(cx)} ${n(cy)}L${n(cx + R * Math.cos(a0))} ${n(cy + R * Math.sin(a0))}L${n(cx + R * Math.cos(a1))} ${n(cy + R * Math.sin(a1))}Z`);
  }
  return out.join("");
}
