export type NavPlace = "Funds" | "Stocks" | "Portfolio" | "Compete" | "Economy" | "Gallery";

export interface GlossaryEntryBase<Id extends string = string> {
  id: Id;
  term: string;

  short: string;

  long: string;

  where: { place: NavPlace | "Account"; label: string; href: string };
  related: string[];
}
