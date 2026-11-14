export * from "./types";
export * from "./format";
export * from "./world";
export * from "./funds";

export const PORTS = {
  web: 3000,
  sandboxRpc: 3030,
  api: 4000,
  relayer: 4110,
  indexer: 4200,
  agents: 4300,
  mcp: 4400,
  world: 4500,
  desk: 4600,
  nav: 4700,
  postgres: 55433,
  redis: 56380,
} as const;

export const NEAR_DECIMALS = 24;

export const accounts = {
  playersParent: (root: string) => `players.${root}`,
  player: (handle: string, root: string) => `${handle.toLowerCase()}.players.${root}`,
  relayer: (root: string) => `relayer.${root}`,

  house: (name: string, root: string) => `house-${name.toLowerCase()}.${root}`,
};

export function isHouseAccount(account: string | null | undefined): boolean {
  return !!account && /^house-[a-z0-9-]+\./.test(account);
}

export const VIZ_COLORS = ["cobalt", "teal", "gold", "plum", "clay"] as const;
export type VizColor = (typeof VIZ_COLORS)[number];

export function companyColor(ticker: string): VizColor {
  const t = ticker.toUpperCase();
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return VIZ_COLORS[h % VIZ_COLORS.length] ?? "cobalt";
}
export const companyColorVar = (ticker: string) => `var(--viz-${companyColor(ticker)})`;

export const PASTEL_OF: Record<VizColor, "sky" | "mint" | "pink" | "lime" | "lavender"> = {
  cobalt: "sky",
  teal: "mint",
  clay: "pink",
  gold: "lime",
  plum: "lavender",
};
export const companyPastel = (ticker: string) => PASTEL_OF[companyColor(ticker)];
export const companyPastelVar = (ticker: string) => `var(--${companyPastel(ticker)})`;
