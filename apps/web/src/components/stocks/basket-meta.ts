import type { BasketId } from "@listed/shared";
import { Bitcoin, Cpu, HeartPulse, IndianRupee, Landmark, MonitorSmartphone, Rocket, ShoppingBag, Zap, type LucideIcon } from "lucide-react";

export interface BasketLook {

  pastel: string;

  tone: string;
  icon: LucideIcon;

  line: string;

  short: string;
}

export const BASKET_LOOK: Record<BasketId, BasketLook> = {
  ai_chips: { pastel: "var(--lavender)", tone: "var(--viz-plum)", icon: Cpu, line: "The chips that train and run AI.", short: "AI & Chips" },
  big_tech: { pastel: "var(--sky)", tone: "var(--viz-cobalt)", icon: MonitorSmartphone, line: "The platforms everyone uses daily.", short: "Big Tech" },
  finance: { pastel: "var(--mint)", tone: "var(--viz-teal)", icon: Landmark, line: "Banks, card networks and Berkshire.", short: "Finance" },
  energy_ev: { pastel: "var(--lime)", tone: "var(--viz-gold)", icon: Zap, line: "Oil majors, clean power and Tesla.", short: "Energy & EV" },
  consumer: { pastel: "var(--pink)", tone: "var(--viz-clay)", icon: ShoppingBag, line: "Brands people buy every week.", short: "Consumer" },
  healthcare: { pastel: "var(--mint)", tone: "var(--viz-teal)", icon: HeartPulse, line: "Drug makers, insurers and care.", short: "Healthcare" },
  india: { pastel: "var(--lime)", tone: "var(--viz-gold)", icon: IndianRupee, line: "India's leaders, priced in dollars.", short: "India" },
  startups: { pastel: "var(--lavender)", tone: "var(--viz-plum)", icon: Rocket, line: "Private companies, marked from real rounds.", short: "Startups" },
  crypto: { pastel: "var(--sky)", tone: "var(--viz-cobalt)", icon: Bitcoin, line: "Moves around the clock, weekends too.", short: "Crypto 24/7" },
};

export const BASKET_ORDER: BasketId[] = ["ai_chips", "big_tech", "finance", "energy_ev", "consumer", "healthcare", "india", "startups", "crypto"];

export function basketLook(id: string): BasketLook {
  return (BASKET_LOOK as Record<string, BasketLook>)[id] ?? BASKET_LOOK.big_tech;
}

export function assetKindLabel(a: { kind: string; region: string }): string {
  if (a.kind === "startup") return "Private · estimated";
  if (a.kind === "crypto") return "Crypto · 24/7";
  if (a.region === "india") return "India · NSE";
  return "US stock";
}
