export interface NewsItem {
  url: string;
  title: string;
  domain: string;
  source: string;
  language: string | null;
  sourceCountry: string | null;
  snippet: string | null;
  publishedAt: Date;
}

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|mc_cid|mc_eid|ocid|cmpid|ito|smid|sr_share|guccounter|guce_referrer|guce_referrer_sig|taid|ref|ref_src|src|feature|traffic_source|_ga|yclid|igshid|mkt_tok)$/i;
const MAX_URL = 2000;

export function canonicalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  if (u.port === "443" || u.port === "80") u.port = "";
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k));
  keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  const out = u.toString();
  return out.length <= MAX_URL ? out : null;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

export function plainText(s: string | null | undefined, max = 400): string {
  if (!s) return "";
  const noTags = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");

  const text = decodeEntities(decodeEntities(noTags)).replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

const LANGS: Record<string, string> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  dutch: "nl",
  russian: "ru",
  chinese: "zh",
  japanese: "ja",
  korean: "ko",
  arabic: "ar",
  hindi: "hi",
  turkish: "tr",
  polish: "pl",
  swedish: "sv",
  indonesian: "id",
};

export function normalizeLanguage(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (LANGS[s]) return LANGS[s] as string;
  const m = /^([a-z]{2,3})(?:[-_][a-z0-9]+)*$/.exec(s);
  return m ? (m[1] as string) : s;
}

export function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const url = canonicalUrl(it.url);
    if (!url || !it.title || Number.isNaN(it.publishedAt.getTime())) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ ...it, url, domain: it.domain || domainOf(url) });
  }
  return out;
}
