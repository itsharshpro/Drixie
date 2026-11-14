import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../http";
import { domainOf, normalizeLanguage, plainText, type NewsItem } from "./normalize";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  isArray: (name) => name === "item" || name === "entry" || name === "link" || name === "category",
});

type Node = string | number | { "#text"?: string | number; [k: string]: unknown } | undefined | null;

const text = (n: unknown): string => {
  if (n === undefined || n === null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return text(n[0]);
  if (typeof n === "object") return text((n as { "#text"?: unknown })["#text"]);
  return "";
};

function parseDate(...candidates: unknown[]): Date | null {
  for (const c of candidates) {
    const s = text(c).trim();
    if (!s) continue;
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t);
  }
  return null;
}

function linkOf(links: unknown): string {
  const arr = Array.isArray(links) ? links : links === undefined ? [] : [links];
  let fallback = "";
  for (const l of arr) {
    if (typeof l === "string") return l.trim();
    if (l && typeof l === "object") {
      const o = l as Record<string, unknown>;
      const href = typeof o["@_href"] === "string" ? (o["@_href"] as string).trim() : "";
      const rel = typeof o["@_rel"] === "string" ? (o["@_rel"] as string) : "alternate";
      if (href && rel === "alternate") return href;
      if (href && !fallback) fallback = href;
      const t = text(o).trim();
      if (t && !fallback) fallback = t;
    }
  }
  return fallback;
}

function publisherDomain(src: unknown): string {
  const node = Array.isArray(src) ? src[0] : src;
  if (!node || typeof node !== "object") return "";
  const url = (node as Record<string, unknown>)["@_url"];
  return typeof url === "string" && /^https?:\/\//.test(url) ? domainOf(url) : "";
}

export function parseFeed(xml: string, feedUrl: string): NewsItem[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const source = `rss:${domainOf(feedUrl)}`;
  const out: NewsItem[] = [];

  const rss = doc.rss as { channel?: Record<string, unknown> } | undefined;
  if (rss?.channel) {
    const ch = rss.channel;
    const language = normalizeLanguage(text(ch.language as Node));
    for (const raw of (ch.item as Record<string, unknown>[] | undefined) ?? []) {
      const url = linkOf(raw.link) || (text(raw.guid as Node).startsWith("http") ? text(raw.guid as Node) : "");
      const title = plainText(text(raw.title as Node), 300);
      const publishedAt = parseDate(raw.pubDate, raw["dc:date"]);
      if (!url || !title || !publishedAt) continue;
      const snippet = plainText(text(raw.description as Node), 400) || null;
      out.push({ url, title, domain: publisherDomain(raw.source) || domainOf(url), source, language, sourceCountry: null, snippet, publishedAt });
    }
    return out;
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    const language = normalizeLanguage(typeof feed["@_xml:lang"] === "string" ? (feed["@_xml:lang"] as string) : "");
    for (const raw of (feed.entry as Record<string, unknown>[] | undefined) ?? []) {
      const url = linkOf(raw.link);
      const title = plainText(text(raw.title as Node), 300);
      const publishedAt = parseDate(raw.published, raw.updated);
      if (!url || !title || !publishedAt) continue;
      const snippet = plainText(text((raw.summary ?? raw.content) as Node), 400) || null;
      out.push({ url, title, domain: domainOf(url), source, language, sourceCountry: null, snippet, publishedAt });
    }
  }
  return out;
}

export interface RssFetchResult {
  items: NewsItem[];
  feedsOk: string[];
  errors: string[];
}

export async function fetchFeeds(feeds: string[], opts: { timeoutMs: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }): Promise<RssFetchResult> {
  const result: RssFetchResult = { items: [], feedsOk: [], errors: [] };
  for (const feed of feeds) {
    try {
      const res = await fetchText(feed, {
        timeoutMs: opts.timeoutMs,
        retries: 2,
        minSpacingMs: 2_000,
        headers: { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8" },
        fetchImpl: opts.fetchImpl,
        sleep: opts.sleep,
      });
      result.items.push(...parseFeed(res.text, feed));
      result.feedsOk.push(feed);
    } catch (err) {
      result.errors.push(`${feed}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
