"use client";
import * as RT from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { createContext, startTransition, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useEdgeFade } from "@/lib/hooks/use-edge-fade";
import { SPRING } from "@/lib/motion";

const TabsCtx = createContext<{ value: string; id: string }>({ value: "", id: "" });

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <TabsCtx.Provider value={{ value, id }}>
      <RT.Root value={value} onValueChange={(v) => startTransition(() => onValueChange(v))} className={className}>
        {children}
      </RT.Root>
    </TabsCtx.Provider>
  );
}

export function TabsList({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const ref = useEdgeFade<HTMLDivElement>();
  return (
    <RT.List
      ref={ref}
      aria-label={label}
      className={cn("hscroll hscroll-flush relative flex gap-4 border-b border-line md:gap-6", className)}
    >
      {children}
    </RT.List>
  );
}

export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: number | null }) {
  const ctx = useContext(TabsCtx);
  const active = ctx.value === value;
  return (
    <RT.Trigger
      value={value}
      className={cn(
        "relative flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 text-body-sm font-medium outline-none transition-colors duration-[120ms]",
        "focus-visible:rounded-chip focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
        active ? "text-ink" : "text-ink-2 hover:text-ink",
      )}
    >
      {children}
      {count !== undefined && count !== null && (
        <span className={cn("num rounded-full px-2 text-caption", active ? "bg-ink text-paper" : "bg-fill text-ink-2")}>{count}</span>
      )}
      {active && (
        <motion.span
          layoutId={`tab-underline-${ctx.id}`}
          transition={SPRING}
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink"
        />
      )}
    </RT.Trigger>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RT.Content value={value} className={cn("fade-in outline-none", className)}>
      {children}
    </RT.Content>
  );
}
