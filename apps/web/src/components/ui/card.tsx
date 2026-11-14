import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export const CARD_PAD = "p-5 md:p-6";

export const CARD_PX = "px-5 md:px-6";

export const CARD_PT = "pt-5 md:pt-6";

export const CARD_PB = "pb-5 md:pb-6";

export const CARD_TITLE = "text-[15px] font-semibold leading-[22px] tracking-[-0.005em] text-ink";

export type CardProps = HTMLAttributes<HTMLDivElement> & {

  interactive?: boolean;

  padded?: boolean;
  as?: "div" | "section" | "article";
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, padded, as: As = "div", ...props },
  ref,
) {
  return (
    <As
      ref={ref}
      className={cn(
        "relative min-w-0 rounded-card bg-paper shadow-e1",
        padded && CARD_PAD,
        interactive &&
          "transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-0.5 hover:shadow-e2 active:translate-y-0 active:duration-[120ms]",
        className,
      )}
      {...props}
    />
  );
});

export function CardHeader({
  title,
  subtitle,
  action,
  meta,
  className,
  icon,
  as: Heading = "h2",
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;

  action?: ReactNode;

  meta?: ReactNode;
  className?: string;
  icon?: ReactNode;
  as?: "h2" | "h3";

  id?: string;
}) {
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-3", CARD_PX, CARD_PT, className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <div className="min-w-0">
          <Heading id={id} className={cn("truncate", CARD_TITLE)}>
            {title}
          </Heading>
          {subtitle && <p className="truncate text-caption text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {(meta || action) && (
        <div className="flex shrink-0 items-center gap-2">
          {meta && <span className="text-caption text-ink-3">{meta}</span>}
          {action}
        </div>
      )}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pt-4", CARD_PX, CARD_PB, className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-11 items-center justify-between gap-3 border-t border-line py-2", CARD_PX, className)} {...props} />;
}
