export const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function isolatedPoints(values: readonly (number | null)[]): number[] {
  const out: number[] = [];
  values.forEach((v, i) => {
    if (ok(v) && !ok(values[i - 1]) && !ok(values[i + 1])) out.push(i);
  });
  return out;
}
