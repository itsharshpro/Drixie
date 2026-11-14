import type { Metadata } from "next";
import { GuideScreen } from "@/components/guide/guide-screen";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = {
  title: "How Drixie works",
  description: "How Drixie works in five pictures: three steps, one bell, what moves a coin, reputation and the words.",
};

export default function GuidePage() {
  return (
    <PageTransition>
      <GuideScreen />
    </PageTransition>
  );
}
