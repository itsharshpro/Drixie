"use client";
import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const TooltipProvider = RT.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  disabled,
  delay = 200,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  disabled?: boolean;
  delay?: number;
  className?: string;
}) {
  if (disabled || !content) return <>{children}</>;
  return (
    <RT.Root delayDuration={delay}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "z-[80] max-w-72 rounded-control bg-paper px-3 py-2 text-caption text-ink shadow-e2",
            "origin-[var(--radix-tooltip-content-transform-origin)] data-[state=delayed-open]:animate-[tooltip-in_160ms_var(--ease)] data-[state=instant-open]:animate-[tooltip-in_120ms_var(--ease)]",
            className,
          )}
        >
          {content}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
