import type { Metadata } from "next";
import { Suspense } from "react";
import { AssetScreen } from "@/components/funds/asset-screen";
import { PageTransition } from "@/components/ui/transitions";

export async function generateMetadata({ params }: PageProps<"/app/s/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: decodeURIComponent(id).toUpperCase() };
}

export default function AssetPage({ params }: PageProps<"/app/s/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={null}>{params.then(({ id }) => <AssetScreen id={decodeURIComponent(id)} />)}</Suspense>
    </PageTransition>
  );
}
