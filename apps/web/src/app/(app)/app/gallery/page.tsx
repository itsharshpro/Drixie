import type { Metadata } from "next";
import { GalleryScreen } from "@/components/funds/gallery-screen";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Gallery" };

export default function Page() {
  return (
    <PageTransition>
      <GalleryScreen />
    </PageTransition>
  );
}
