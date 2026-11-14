import { NextResponse, type NextRequest } from "next/server";

const SCRAPERS = /(curl|wget|python-requests|python-urllib|aiohttp|httpx|scrapy|httpclient|okhttp|go-http-client|java\/|libwww|lwp|mechanize|phantomjs|selenium|puppeteer-extra|crawler|spider|scraper|gptbot|ccbot|bytespider|petalbot|google-extended|perplexitybot|amazonbot|applebot-extended|cohere|diffbot|omgili|img2dataset|facebookexternalhit)/i;

export function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_PROTECT === "0") return NextResponse.next();
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || SCRAPERS.test(ua)) {
    return new NextResponse("Automated access is not allowed.", { status: 403, headers: { "x-robots-tag": "noindex, nofollow, noarchive, noai, noimageai" } });
  }
  const res = NextResponse.next();
  res.headers.set("x-robots-tag", "noindex, nofollow, noarchive, noai, noimageai");
  return res;
}

export const config = {

  matcher: ["/((?!_next/|favicon.ico|icon.svg|apple-icon.png|opengraph-image|robots.txt|.*\\.(?:png|jpg|svg|webp|ico|woff2?)$).*)"],
};
