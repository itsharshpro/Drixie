"use client";
import * as RD from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useIsPhone } from "@/lib/hooks/use-media";
import { DUR, EASE, SHEET_SPRING } from "@/lib/motion";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const phone = useIsPhone();
  const reduce = useReducedMotion();
  const hidden = reduce ? { opacity: 0 } : phone ? { y: "100%" } : { x: "100%" };
  const shown = reduce ? { opacity: 1 } : phone ? { y: 0 } : { x: 0 };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false);
  };

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
            <RD.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  "fixed z-[71] flex flex-col bg-paper shadow-e3 outline-none",
                  phone
                    ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-sheet pb-[env(safe-area-inset-bottom)]"
                    : "bottom-2 right-2 top-2 w-[440px] max-w-[calc(100vw-16px)] rounded-sheet",
                  className,
                )}
                initial={hidden}
                animate={shown}

                exit={{ ...hidden, transition: { duration: DUR.standard, ease: EASE } }}
                transition={reduce ? { duration: 0.15 } : SHEET_SPRING}
                drag={phone && !reduce ? "y" : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={onDragEnd}
              >
                {phone && (
                  <div className="flex justify-center pt-2" aria-hidden>
                    <span className="h-1 w-10 rounded-full bg-line-strong" />
                  </div>
                )}
                <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <RD.Title className="text-title-sm font-semibold tracking-[-0.01em]">{title}</RD.Title>
                    {description ? (
                      <RD.Description className="text-body-sm text-ink-2">{description}</RD.Description>
                    ) : null}
                  </div>
                  <RD.Close
                    className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-fill hover:text-ink"
                    aria-label="Close"
                  >
                    <X className="size-5" />
                  </RD.Close>
                </div>
                <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 pb-6" onPointerDownCapture={(e) => e.stopPropagation()}>
                  {children}
                </div>
                {footer && <div className="border-t border-line px-6 py-4">{footer}</div>}
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}
