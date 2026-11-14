import type { Metadata } from "next";
import { StocksScreen } from "@/components/funds/stocks-screen";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Stocks" };

export default function Page() {
  return (
    <PageTransition>
      <StocksScreen />
    </PageTransition>
  );
}
