"use client";

import { usePublicPortfolio } from "@/lib/funds/queries";
import { Avatar } from "../shell/avatar";
import { CopyButton } from "../ui/copy-button";
import { ErrorState } from "../ui/error-state";
import { HouseTag } from "../ui/house-tag";
import { PageHeader } from "../ui/page-header";
import { Reveal } from "../ui/transitions";
import { PortfolioBody, PortfolioSkeleton } from "./portfolio-screen";

export const handleOf = (account: string) => account.split(".players.")[0]?.split(".")[0] || account;

export function PersonScreen({ account }: { account: string }) {
  const q = usePublicPortfolio(account);
  const handle = handleOf(account);
  return (
    <>
      <PageHeader
        leading={<Avatar name={handle} size={56} />}
        eyebrow="Investor"
        title={
          <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            <span className="min-w-0 truncate">{handle}</span>
            <HouseTag account={account} />
          </span>
        }
        subtitle={
          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
            <span className="num min-w-0 truncate">{account}</span>
            <CopyButton value={account} label="Copy account" />
          </span>
        }
      />
      {q.isError && !q.data ? (
        <div className="pt-10">
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isRefetching} />
        </div>
      ) : (
        <Reveal ready={!!q.data} fallback={<PortfolioSkeleton />}>
          {() => <PortfolioBody p={q.data!} owner={false} />}
        </Reveal>
      )}
    </>
  );
}
