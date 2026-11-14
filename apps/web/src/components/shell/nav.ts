import { CandlestickChart, Globe, Images, Landmark, PieChart, Settings, Trophy, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;

  blurb: string;

  headline?: string;
  match: (path: string) => boolean;

  keywords?: string;
}

export interface SectionTab {
  href: string;
  label: string;
  match: (path: string) => boolean;
  keywords?: string;
}

const starts = (...prefixes: string[]) => (p: string) => prefixes.some((x) => p === x || p.startsWith(`${x}/`));

export const SECTIONS = {} satisfies Record<string, SectionTab[]>;

export type SectionKey = keyof typeof SECTIONS;

export const NAV: NavItem[] = [
  {
    href: "/app",
    label: "Funds",
    icon: Landmark,
    blurb: "Compare the five AI fund managers and back one.",
    headline: "Five AI managers. Back one.",
    match: (p) => p === "/app" || p.startsWith("/app/f/") || p.startsWith("/app/start"),
    keywords: "funds managers nav buy in coin atlas meridian nova orion kite risk check",
  },
  {
    href: "/app/stocks",
    label: "Stocks",
    icon: CandlestickChart,
    blurb: "Every stock and startup the funds can hold, with real prices.",
    headline: "Everything the funds can hold.",
    match: (p) => p.startsWith("/app/stocks") || p.startsWith("/app/s/"),
    keywords: "stocks baskets universe prices startups india nvda apple spy",
  },
  {
    href: "/app/portfolio",
    label: "Portfolio",
    icon: PieChart,
    blurb: "Your fund coins, value, profit, orders and badges.",
    headline: "Your funds, coins and orders.",
    match: starts("/app/portfolio"),
    keywords: "portfolio coins holdings value profit orders badges cash out",
  },
  {
    href: "/app/compete",
    label: "Compete",
    icon: Trophy,
    blurb: "The season clock, leaderboards, predictions and trophies.",
    headline: "The season, live.",
    match: (p) => starts("/app/compete")(p) || p.startsWith("/app/people/"),
    keywords: "compete season leaderboard predictions trophies dna winner",
  },
  {
    href: "/app/economy",
    label: "Economy",
    icon: Globe,
    blurb: "News, every move, raids, reputation events and the vault.",
    headline: "News and money moving.",
    match: starts("/app/economy"),
    keywords: "economy news moves raids reputation vault coverage feed",
  },
  {
    href: "/app/gallery",
    label: "Gallery",
    icon: Images,
    blurb: "Basket cards, manager seats and auctions, badges and trophies.",
    headline: "Cards, seats, badges, trophies.",
    match: starts("/app/gallery"),
    keywords: "gallery nft basket cards seats auctions badges trophies",
  },
];

export const SETTINGS_NAV: NavItem = {
  href: "/app/settings",
  label: "Settings",
  icon: Settings,
  blurb: "Your account, this device's key and signing out.",
  headline: "Your account and this device.",
  match: starts("/app/settings"),
};

const byHref = (href: string) => NAV.find((n) => n.href === href)!;

export const PHONE_TABS: NavItem[] = [byHref("/app"), byHref("/app/portfolio"), byHref("/app/stocks")];
export const PHONE_MORE: NavItem[] = [byHref("/app/compete"), byHref("/app/economy"), byHref("/app/gallery")];

export function navFor(path: string): NavItem | null {
  return [...NAV, SETTINGS_NAV].find((n) => n.match(path)) ?? null;
}

export function sectionFor(path: string): { key: SectionKey; tabs: SectionTab[]; active: SectionTab } | null {
  for (const key of Object.keys(SECTIONS) as SectionKey[]) {
    const tabs: SectionTab[] = SECTIONS[key];
    const active = tabs.find((t) => t.match(path));
    if (active) return { key, tabs, active };
  }
  return null;
}

export function titleFor(path: string): { title: string; parent?: { label: string; href: string } } {
  const seg = (i: number) => decodeURIComponent(path.split("/")[i] ?? "");
  if (path.startsWith("/app/f/")) {
    const id = seg(3);
    return { title: id.charAt(0).toUpperCase() + id.slice(1), parent: { label: "Funds", href: "/app" } };
  }
  if (path.startsWith("/app/start")) return { title: "Risk check", parent: { label: "Funds", href: "/app" } };
  if (path.startsWith("/app/s/")) return { title: seg(3).toUpperCase(), parent: { label: "Stocks", href: "/app/stocks" } };
  if (path.startsWith("/app/people/")) {
    const account = seg(3);
    return { title: account.split(".players.")[0]?.split(".")[0] || "Player", parent: { label: "Compete", href: "/app/compete" } };
  }
  if (path.startsWith("/app/guide")) return { title: "How Drixie works" };
  const item = navFor(path);
  return { title: item?.label ?? "Drixie" };
}
