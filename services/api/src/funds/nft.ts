import { dz, fundBells, fundNavHistory, fundNfts, fundWeightsHistory, type Db } from "@listed/db";
import { assetById } from "@listed/fundmath";
import { FUND_SEEDS, LAUNCH_NAV_USD, type FundNft, type FundNftKind, type NftPage, type SeedFundId } from "@listed/shared";
import { decodeCursor, encodeCursor, isTimeCursor } from "../lib/cursor";
import { TtlCache } from "../lib/ttl-cache";

type NftRow = typeof fundNfts.$inferSelect;

export const nftImageUrl = (tokenId: string) => `/v1/nft/${encodeURIComponent(tokenId)}.svg`;
export const basketImageUrl = (fund: string, edition: number) => `/v1/nft/basket/${encodeURIComponent(fund)}/${edition}.svg`;

export function toFundNft(r: NftRow): FundNft {
  const kind = (["seat", "basket", "badge", "trophy"].includes(r.kind) ? r.kind : "basket") as FundNftKind;
  return {
    tokenId: r.tokenId,
    kind,
    owner: r.owner,
    fund: r.fund,
    title: r.title,
    description: r.description,
    edition: r.edition,
    bell: r.bell,
    season: r.season,
    soulbound: r.soulbound,
    imageUrl: kind === "basket" && r.fund && r.edition !== null ? basketImageUrl(r.fund, r.edition) : nftImageUrl(r.tokenId),
    metadataUrl: `/v1/nft/${encodeURIComponent(r.tokenId)}/metadata`,
    extra: r.extra ?? null,
    mintedAt: r.mintedAt.toISOString(),
    txHash: r.txHash,
  };
}

export async function listNfts(
  db: Db,
  q: { kind?: string; owner?: string; fund?: string; cursor?: string; limit: number },
): Promise<NftPage> {
  const cur = decodeCursor(q.cursor, isTimeCursor);
  const conds = [dz.eq(fundNfts.burned, false)];
  if (q.kind) conds.push(dz.eq(fundNfts.kind, q.kind));
  if (q.owner) conds.push(dz.eq(fundNfts.owner, q.owner));
  if (q.fund) conds.push(dz.eq(fundNfts.fund, q.fund));
  if (cur) conds.push(dz.sql`(${fundNfts.mintedAt}, ${fundNfts.tokenId}) < (${cur[0]}::timestamptz, ${cur[1]})`);
  const rows = await db
    .select()
    .from(fundNfts)
    .where(dz.and(...conds))
    .orderBy(dz.desc(fundNfts.mintedAt), dz.desc(fundNfts.tokenId))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return { items: page.map(toFundNft), nextCursor: rows.length > q.limit && last ? encodeCursor([last.mintedAt.toISOString(), last.tokenId]) : null };
}

export async function nftByToken(db: Db, tokenId: string): Promise<NftRow | null> {
  const [r] = await db.select().from(fundNfts).where(dz.eq(fundNfts.tokenId, tokenId)).limit(1);
  return r ?? null;
}

export function nftMetadata(r: NftRow, base: string): Record<string, unknown> {
  const n = toFundNft(r);
  return {
    token_id: r.tokenId,
    owner_id: r.owner,
    metadata: {
      title: r.title,
      description: r.description ?? `${r.kind} NFT on Drixie (a simulation priced off real markets).`,
      media: `${base}${n.imageUrl}`,
      issued_at: String(r.mintedAt.getTime()),
      extra: JSON.stringify({ kind: r.kind, fund: r.fund, edition: r.edition, bell: r.bell, season: r.season, soulbound: r.soulbound, ...(r.extra ?? {}) }),
    },
  };
}

type Renderer = (data: unknown, opts?: { fonts?: "embed" | "none" }) => string;
let artModule: Record<string, unknown> | null | undefined;

async function art(): Promise<Record<string, unknown> | null> {
  if (artModule !== undefined) return artModule;
  try {

    const name = "@listed/nftart";
    artModule = (await import(name)) as Record<string, unknown>;
  } catch {
    artModule = null;
  }
  return artModule;
}

async function renderer(...names: string[]): Promise<Renderer | null> {
  const m = await art();
  if (!m) return null;
  for (const n of names) if (typeof m[n] === "function") return m[n] as Renderer;
  return null;
}

const svgCache = new TtlCache<string | null>(60_000, 100);

export interface BasketEdition {
  fund: string;
  edition: number;
  bell: number;
  at: Date;
  weights: { asset: string; bps: number }[];
  prev: { asset: string; bps: number }[];
  cashBps: number;
}

export async function basketEdition(db: Db, fund: string, edition: number): Promise<BasketEdition | null> {
  let [r] = await db
    .select()
    .from(fundWeightsHistory)
    .where(dz.and(dz.eq(fundWeightsHistory.fund, fund), dz.eq(fundWeightsHistory.edition, edition)))
    .limit(1);
  if (!r && edition >= 1) {
    [r] = await db
      .select()
      .from(fundWeightsHistory)
      .where(dz.eq(fundWeightsHistory.fund, fund))
      .orderBy(dz.asc(fundWeightsHistory.id))
      .offset(edition - 1)
      .limit(1);
  }
  if (!r) return null;
  return { fund, edition, bell: r.bell, at: r.at, weights: r.weights, prev: r.prevWeights, cashBps: r.cashBps };
}

export async function basketSvg(db: Db, fund: string, edition: number): Promise<string | null> {
  return svgCache.get(`basket:${fund}:${edition}`, async () => {
    const e = await basketEdition(db, fund, edition);
    if (!e) return null;
    const [nav] = await db
      .select({ nav: fundNavHistory.nav })
      .from(fundNavHistory)
      .where(dz.and(dz.eq(fundNavHistory.fund, fund), dz.lte(fundNavHistory.bell, e.bell)))
      .orderBy(dz.desc(fundNavHistory.bell))
      .limit(1);
    const [bell] = await db.select({ h: fundBells.pricesHash }).from(fundBells).where(dz.eq(fundBells.bell, e.bell)).limit(1);
    const seed = FUND_SEEDS[fund as SeedFundId];
    const prev = new Map(e.prev.map((w) => [w.asset, w.bps]));
    const data = {
      fund,
      name: seed?.name ?? fund,
      mandate: seed?.mandateLine ?? "",
      edition,
      bell: e.bell,
      at: e.at.toISOString(),
      nav: nav?.nav ?? LAUNCH_NAV_USD,
      launchNav: LAUNCH_NAV_USD,
      holdings: e.weights.slice(0, 10).map((w) => ({
        asset: w.asset,
        label: assetById(w.asset)?.name ?? w.asset,
        bps: w.bps,
        estimated: assetById(w.asset)?.kind === "startup",
        delta: e.prev.length ? w.bps - (prev.get(w.asset) ?? 0) : null,
        entered: e.prev.length > 0 && !prev.has(w.asset),
      })),
      cashBps: e.cashBps,
      pricesHash: bell?.h ?? null,
    };
    const render = await renderer("renderBasketCard");
    try {
      return render ? render(data) : fallbackSvg(`${data.name} basket card #${edition}`, data.holdings.map((h) => `${h.label} ${(h.bps / 100).toFixed(1)}%`));
    } catch {
      return fallbackSvg(`${data.name} basket card #${edition}`, data.holdings.map((h) => `${h.label} ${(h.bps / 100).toFixed(1)}%`));
    }
  });
}

export async function tokenSvg(db: Db, tokenId: string): Promise<string | null> {
  const r = await nftByToken(db, tokenId);
  if (!r) return null;
  if (r.kind === "basket" && r.fund && r.edition !== null) return basketSvg(db, r.fund, r.edition);
  return svgCache.get(`token:${tokenId}:${r.owner}`, async () => {
    const seed = r.fund ? FUND_SEEDS[r.fund as SeedFundId] : undefined;
    const common = { fund: r.fund, name: seed?.name ?? r.fund ?? "Drixie", title: r.title, owner: r.owner, season: r.season, mintedAt: r.mintedAt.toISOString(), tokenId: r.tokenId };
    const names =
      r.kind === "seat"
        ? ["renderSeat", "renderSeatCard", "renderManagerSeat"]
        : r.kind === "trophy"
          ? ["renderTrophy", "renderTrophyCard"]
          : ["renderBadge", "renderBadgeCard", "renderInvestorBadge"];
    const render = await renderer(...names);
    const data = r.kind === "badge" ? { ...common, kind: r.badgeKind ?? "early_backer", badge: r.badgeKind ?? "early_backer" } : { ...common, mandate: seed?.mandateLine ?? "" };
    try {
      if (render) return render(data);
    } catch {

    }
    return fallbackSvg(r.title, [r.fund ? `Fund: ${seed?.name ?? r.fund}` : "Drixie", `Owner: ${r.owner}`, r.season ? `Season ${r.season}` : ""].filter(Boolean));
  });
}

const escXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function fallbackSvg(title: string, lines: string[]): string {
  const rows = lines
    .slice(0, 12)
    .map((l, i) => `<text x="48" y="${200 + i * 52}" font-size="28" fill="#0F1117" fill-opacity="0.64">${escXml(l)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><rect width="800" height="1000" rx="32" fill="#FFFFFF"/><rect x="0.5" y="0.5" width="799" height="999" rx="32" fill="none" stroke="#0F1117" stroke-opacity="0.08"/><text x="48" y="110" font-family="Geist, ui-sans-serif, system-ui, sans-serif" font-size="40" font-weight="600" fill="#0F1117">${escXml(title)}</text><g font-family="Geist, ui-sans-serif, system-ui, sans-serif">${rows}</g><text x="48" y="950" font-family="Geist, ui-sans-serif, system-ui, sans-serif" font-size="22" fill="#2B44D9">Drixie</text></svg>`;
}
