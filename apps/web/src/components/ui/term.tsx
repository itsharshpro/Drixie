"use client";

import * as Popover from "@radix-ui/react-popover";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { GUIDE_PATH, glossaryEntry, guideHref, type GlossaryId } from "@/lib/glossary";

const LEARN_MORE =
  "-mx-2 -mb-2 mt-2 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-label font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand";
const OPEN_DELAY = 200;
const CLOSE_DELAY = 150;

export function Term({ id, children, className }: { id: GlossaryId; children?: ReactNode; className?: string }) {
  const entry = glossaryEntry(id);
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const word = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pinned = useRef(false);

  const onGuide = usePathname() === GUIDE_PATH;

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const show = (pin: boolean) => {
    clear();
    if (pin) pinned.current = true;
    setOpen(true);
  };
  const hide = () => {
    clear();
    pinned.current = false;
    setOpen(false);
  };

  const hoverIn = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clear();
    timer.current = setTimeout(() => setOpen(true), open ? 0 : OPEN_DELAY);
  };
  const hoverOut = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || pinned.current) return;
    clear();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  const toggle = () => {

    if (open && pinned.current) hide();
    else show(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => (o ? show(true) : hide())}>
      <Popover.Anchor asChild>
        <span
          ref={word}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? contentId : undefined}
          data-state={open ? "open" : "closed"}
          onClick={toggle}
          onKeyDown={onKey}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
          className={cn(
            "relative cursor-help rounded-[3px] outline-none",
            "underline decoration-ink-3 decoration-dotted decoration-1 underline-offset-[3px] transition-[text-decoration-color] duration-150",
            "hover:decoration-brand data-[state=open]:decoration-brand",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",

            "pointer-coarse:before:absolute pointer-coarse:before:left-1/2 pointer-coarse:before:top-1/2 pointer-coarse:before:h-11 pointer-coarse:before:w-full pointer-coarse:before:min-w-11 pointer-coarse:before:-translate-x-1/2 pointer-coarse:before:-translate-y-1/2 pointer-coarse:before:content-['']",
            className,
          )}
        >
          {children ?? entry.term}
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          id={contentId}
          role="dialog"
          aria-label={entry.term}
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}

          onOpenAutoFocus={(e) => {
            if (!pinned.current) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();

            if (document.activeElement && document.activeElement !== document.body) return;
            word.current?.focus({ preventScroll: true });
          }}

          onInteractOutside={(e) => {
            if (word.current && e.target instanceof Node && word.current.contains(e.target)) e.preventDefault();
          }}
          className="pop-in z-[80] w-[min(18rem,calc(100vw-32px))] rounded-card bg-paper p-4 shadow-e2 outline-none"
        >
          <p className="text-label font-semibold text-ink">{entry.term}</p>
          <p className="mt-1 text-body-sm text-ink-2">{entry.short}</p>
          {onGuide ? (
            <a href={`#${id}`} onClick={hide} className={LEARN_MORE}>
              Learn more
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
          ) : (
            <Link href={guideHref(id)} onClick={hide} className={LEARN_MORE}>
              Learn more
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
