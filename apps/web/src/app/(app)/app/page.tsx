import type { Metadata } from "next";
import { FundsScreen } from "@/components/funds/funds-screen";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Funds" };

export default function FundsPage() {
  return (
    <PageTransition>
      <FundsScreen />
    </PageTransition>
  );
}
