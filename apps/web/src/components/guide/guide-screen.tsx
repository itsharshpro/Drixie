"use client";

import { useFunds, useSeason } from "@/lib/funds/queries";
import { PageHeader } from "../ui/page-header";
import { BellTimeline } from "./bell-timeline";
import { CoinDiagram } from "./coin-diagram";
import { ReputationGlance } from "./reputation-glance";
import { ThreeSteps } from "./three-steps";
import { AllWords, useAllWords, Words } from "./words";

export function GuideScreen() {
  const season = useSeason();
  const funds = useFunds();
  const clock = season.data?.clock ?? null;
  const nextBellAt = clock?.nextBellAt ?? funds.data?.nextBellAt ?? null;
  const words = useAllWords();

  return (
    <div className="flex flex-col">
      <PageHeader title="How Drixie works" subtitle="Two minutes, five pictures." back={false} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ThreeSteps clock={clock} className="lg:col-span-12" />
        <BellTimeline clock={clock} nextBellAt={nextBellAt} className="lg:col-span-7" />
        <Words open={words.open} onToggle={words.toggle} className="order-last lg:order-none lg:col-span-5" />
        <CoinDiagram className="lg:col-span-6" />
        <ReputationGlance className="lg:col-span-6" />
      </div>
      <AllWords open={words.open} hash={words.hash} className="mt-4" />
    </div>
  );
}
