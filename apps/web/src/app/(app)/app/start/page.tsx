import type { Metadata } from "next";
import { RiskCheckScreen } from "@/components/funds/risk-check";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Risk check" };

export default function Page() {
  return (
    <PageTransition>
      <RiskCheckScreen />
    </PageTransition>
  );
}
