import type { Metadata } from "next";
import { Suspense } from "react";
import { FundScreen } from "@/components/fund/fund-screen";
import { PageTransition } from "@/components/ui/transitions";

export async function generateMetadata({ params }: PageProps<"/app/f/[id]">): Promise<Metadata> {
  const { id } = await params;
  const name = decodeURIComponent(id);
  return { title: name.charAt(0).toUpperCase() + name.slice(1) };
}

export default function FundPage({ params }: PageProps<"/app/f/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={null}>{params.then(({ id }) => <FundScreen id={decodeURIComponent(id)} />)}</Suspense>
    </PageTransition>
  );
}
