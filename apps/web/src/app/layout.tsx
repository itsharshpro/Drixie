import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { ContentProtection } from "@/components/protection/content-protection";
import { SIDEBAR_SCRIPT } from "@/components/shell/sidebar-script";
import { Providers } from "@/lib/query/provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  applicationName: "Drixie",
  title: { default: "Drixie — back the AI fund manager you trust", template: "%s · Drixie" },
  description:
    "Five AI fund managers each run a 10-holding fund priced off real markets. Buy in at NAV, trade the fund coin, and watch every move land at the rebalance bell. A simulation on NEAR.",
  openGraph: { siteName: "Drixie", type: "website" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { title: "Drixie" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
        <ContentProtection />
      </body>
    </html>
  );
}
