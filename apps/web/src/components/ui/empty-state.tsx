import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { LINE_ICONS, type LineIconName } from "./line-icons";

export type EmptyAction = { label: string; href: string; onClick?: never } | { label: string; onClick: () => void; href?: never };

function isSpec(a: unknown): a is EmptyAction {
  return !!a && typeof a === "object" && "label" in a && ("href" in a || "onClick" in a);
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  compact,
}: {
  icon: LineIconName;
  title: string;
  body: ReactNode;
  action?: EmptyAction | ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const act = isSpec(action) ? (
    action.href !== undefined ? (
      <Button asChild>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    ) : (
      <Button onClick={action.onClick}>{action.label}</Button>
    )
  ) : (
    action
  );
  return (
    <div className={cn("rise-in flex flex-col items-center justify-center text-center", compact ? "gap-3 px-6 py-10" : "gap-4 px-6 py-16", className)}>
      <div className="flex size-16 items-center justify-center">{LINE_ICONS[icon]}</div>
      <div className="flex max-w-80 flex-col gap-1">
        <h3 className="text-title-sm font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        <p className="text-body-sm text-ink-2 [&_a]:font-medium [&_a]:text-brand [&_a]:underline-offset-4 hover:[&_a]:underline">{body}</p>
      </div>
      {act ? <div className="pt-1">{act}</div> : null}
    </div>
  );
}
