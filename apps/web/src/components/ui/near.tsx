import { cn } from "@/lib/cn";
import { exactNear, formatNearAmount, formatPrice } from "@/lib/format";

export function Near({
  yocto,
  price,
  fixed,
  className,
  unitClassName,
  signed,
  digits,
}: {
  yocto: string;
  price?: boolean;

  fixed?: boolean;
  className?: string;
  unitClassName?: string;
  signed?: boolean;
  digits?: number;
}) {
  const b = BigInt(/^-?\d+$/.test(yocto || "") ? yocto : "0");
  const abs = b < BigInt(0) ? (-b).toString() : b.toString();
  const text = price ? formatPrice(abs) : formatNearAmount(abs, { ...(digits !== undefined ? { digits } : {}), fixed });
  const sign = signed && b !== BigInt(0) ? (b > BigInt(0) ? "+" : "−") : b < BigInt(0) ? "−" : "";
  const tiny = text.startsWith("<");
  return (
    <span className={cn("num whitespace-nowrap", className)} title={tiny ? `${sign}${exactNear(abs)}` : undefined}>
      {sign}
      {text}
      <span className={cn("ml-1 font-sans text-[0.72em] font-medium tracking-normal text-ink-3", unitClassName)}>NEAR</span>
    </span>
  );
}
