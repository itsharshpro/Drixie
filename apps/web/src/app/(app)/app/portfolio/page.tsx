import type { Metadata } from "next";
import { FundPortfolioScreen } from "@/components/funds/portfolio-screen";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <PageTransition>
      <FundPortfolioScreen />
    </PageTransition>
  );
}
