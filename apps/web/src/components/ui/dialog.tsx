"use client";
import * as RD from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE, SPRING } from "@/lib/motion";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  hideTitle?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[70] bg-ink/24"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.standard, ease: EASE }}
              />
            </RD.Overlay>
            <RD.Content asChild forceMount>
              <motion.div
                className={cn(
                  "fixed left-1/2 top-1/2 z-[71] flex -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg flex-col overflow-hidden rounded-sheet bg-paper shadow-e3 outline-none",
                  className,
                )}
                initial={{ opacity: 0, scale: reduce ? 1 : 0.98, y: reduce ? 0 : 8 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: 0,
                  transition: reduce ? { duration: 0.15 } : { ...SPRING, opacity: { duration: DUR.standard, ease: EASE } },
                }}
                exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: DUR.standard, ease: EASE } }}
              >
                <div className={cn("flex items-start justify-between gap-4 px-6 pt-6", hideTitle && "sr-only")}>
                  <div className="flex flex-col gap-1">
                    <RD.Title className="text-title-sm font-semibold tracking-[-0.01em]">{title}</RD.Title>
                    {description ? (
                      <RD.Description className="text-body-sm text-ink-2">{description}</RD.Description>
                    ) : (
                      <RD.Description className="sr-only">{title}</RD.Description>
                    )}
                  </div>
                  <RD.Close className="-mr-2 -mt-2 inline-flex size-11 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-fill hover:text-ink" aria-label="Close">
                    <X className="size-5" />
                  </RD.Close>
                </div>
                <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">{children}</div>
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}
