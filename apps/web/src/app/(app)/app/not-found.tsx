import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NAV, PageTransition } from "@/components/ui/transitions";

export default function AppNotFound() {
  return (
    <PageTransition>
      <EmptyState
        icon="search"
        title="This page doesn't exist"
        body="Check the link, or head back to the market."
        action={
          <Button asChild>
            <Link href="/app" transitionTypes={NAV.back}>
              Open the market
            </Link>
          </Button>
        }
      />
    </PageTransition>
  );
}
