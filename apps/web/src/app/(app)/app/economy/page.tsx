import type { Metadata } from "next";
import { EconomyScreen } from "@/components/funds/economy-screen";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Economy" };

export default function Page() {
  return (
    <PageTransition>
      <EconomyScreen />
    </PageTransition>
  );
}
