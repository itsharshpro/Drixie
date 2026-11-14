import type { Metadata } from "next";
import { CompeteScreen } from "@/components/funds/compete-screen";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Compete" };

export default function Page() {
  return (
    <PageTransition>
      <CompeteScreen />
    </PageTransition>
  );
}
