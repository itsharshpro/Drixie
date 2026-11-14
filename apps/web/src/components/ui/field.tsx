"use client";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, Check } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE } from "@/lib/motion";

export interface FieldProps {
  label: string;
  helper?: ReactNode;
  error?: string | null;
  success?: boolean;
  optional?: boolean;
  className?: string;

  children: ReactElement<Record<string, unknown>>;
  trailingLabel?: ReactNode;
}

export function Field({ label, helper, error, success, optional, className, children, trailingLabel }: FieldProps) {
  const id = useId();
  const helperId = `${id}-help`;
  const errorId = `${id}-err`;
  const describedBy = error ? errorId : helper ? helperId : undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={(isValidElement(children) && (children.props.id as string)) || id} className="text-label font-medium text-ink">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-3">(optional)</span>}
        </label>
        <span className="flex items-center gap-2">
          {trailingLabel}
          <AnimatePresence>
            {success && !error && (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.standard, ease: EASE }}
                className="text-up"
                aria-label="Looks good"
              >
                <Check className="size-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>
      {control}
      <div className="min-h-4">
        <AnimatePresence mode="wait" initial={false}>
          {error ? (
            <motion.p
              key="err"
              id={errorId}
              role="alert"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.micro, ease: EASE }}
              className="flex items-start gap-1 text-caption text-down"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </motion.p>
          ) : helper ? (
            <motion.p
              key="help"
              id={helperId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.micro }}
              className="text-caption text-ink-2"
            >
              {helper}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
