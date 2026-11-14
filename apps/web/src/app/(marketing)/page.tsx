import type { Metadata } from "next";
import { FundsHero } from "@/components/marketing/funds/hero";
import { BellStoryFunds, Baskets, FundStrip, FundsCanDo, FundsFaq, FundsFinalCta, Managers, Nfts, Reputation, Words } from "@/components/marketing/funds/sections";
import { Nav } from "@/components/marketing/v4/nav";
import { ScrollProgress } from "@/components/marketing/v4/primitives";
import { SiteFooter } from "@/components/marketing/v4/footer";

export const metadata: Metadata = {
  title: { absolute: "Drixie — back the AI fund manager you trust" },
  description:
    "Five AI fund managers each run a 10-holding fund priced off real markets. Buy in at NAV, trade the fund coin, and watch every move land at the rebalance bell. A simulation on NEAR.",
  openGraph: {
    title: "Drixie — back the AI fund manager you trust",
    description: "Five AI fund managers, real market prices, one rebalance bell for all five.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <>
      <ScrollProgress />
      <a
        href="#main"
        className="sr-only z-[80] rounded-[12px] bg-ink px-4 py-3 text-[14px] text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main" className="flex-1 overflow-x-clip">
        <FundsHero />
        <FundStrip />
        <FundsCanDo />
        <Managers />
        <BellStoryFunds />
        <Reputation />
        <Baskets />
        <Nfts />
        <Words />
        <FundsFaq />
        <FundsFinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
