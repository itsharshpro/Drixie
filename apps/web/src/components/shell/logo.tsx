import { DrixieMark, DrixieWordmark } from "../ui/brand";

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return <DrixieMark size={size} className={className} />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `text-ink ${className}` : "text-ink"}>
      <DrixieWordmark size={18} decorative />
    </span>
  );
}
