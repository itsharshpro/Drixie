import { isHouseAccount } from "@listed/shared";
import { cn } from "@/lib/cn";

export function isHouse(account: string | null | undefined, flag?: boolean | null): boolean {
  return flag === true || isHouseAccount(account);
}

export function HouseTag({
  account,
  isHouse: flag,
  className,
}: {
  account?: string | null;

  isHouse?: boolean | null;
  className?: string;
}) {
  if (!isHouse(account, flag)) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-brand-soft px-2 align-middle text-[11px] font-medium leading-none text-brand",
        className,
      )}
      title="A disclosed Drixie house investor. It buys in, cashes out and trades coins by fixed public rules."
    >
      House
    </span>
  );
}
