export const GLYPH_N = 5;

function hash(text: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return h >>> 0;
}

function expand(bits: number): boolean[][] {
  const rows: boolean[][] = [];
  for (let r = 0; r < GLYPH_N; r++) {
    const a = ((bits >>> (r * 3)) & 1) === 1;
    const b = ((bits >>> (r * 3 + 1)) & 1) === 1;
    const c = ((bits >>> (r * 3 + 2)) & 1) === 1;
    rows.push([a, b, c, b, a]);
  }
  return rows;
}

function legible(g: boolean[][]): boolean {
  const count = g.flat().filter(Boolean).length;
  if (count < 11 || count > 17) return false;
  if (!g[0]!.some(Boolean) || !g[GLYPH_N - 1]!.some(Boolean)) return false;
  if (!g.some((row) => row[0])) return false;
  if (!g.some((row) => row[2])) return false;
  for (const row of g) if (!row.some(Boolean)) return false;
  return true;
}

export function markGlyph(id: string): boolean[][] {
  const t = id.trim().toUpperCase() || "?";
  let glyph = expand(hash(t, 0) & 0x7fff);
  for (let seed = 1; seed < 64 && !legible(glyph); seed++) glyph = expand(hash(t, seed) & 0x7fff);
  return glyph;
}
