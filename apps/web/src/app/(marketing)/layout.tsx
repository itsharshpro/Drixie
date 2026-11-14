import { FundsLive } from "@/components/marketing/funds/data/live";
import { SmoothScroll } from "@/components/marketing/v4/primitives/smooth-scroll";
import "@/components/marketing/v4/primitives/v4.css";
import "@/components/marketing/funds/funds.css";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScroll>
      <FundsLive>
        <div className="v4-root flex flex-1 flex-col">{children}</div>
      </FundsLive>
    </SmoothScroll>
  );
}
