import type { Metadata } from "next";
import { Suspense } from "react";
import { PersonScreen } from "@/components/funds/person-screen";
import { PortfolioSkeleton } from "@/components/funds/portfolio-screen";
import { PageTransition } from "@/components/ui/transitions";

export async function generateMetadata({ params }: PageProps<"/app/people/[account]">): Promise<Metadata> {
  const { account } = await params;
  const id = decodeURIComponent(account);
  return { title: id.split(".")[0] || "Investor" };
}

export default function PersonPage({ params }: PageProps<"/app/people/[account]">) {
  return (
    <PageTransition>
      <Suspense fallback={<PortfolioSkeleton />}>
        {params.then(({ account }) => (
          <PersonScreen account={decodeURIComponent(account).toLowerCase()} />
        ))}
      </Suspense>
    </PageTransition>
  );
}
