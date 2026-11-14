import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const controlBase = cn(
  "w-full rounded-control bg-paper text-body-sm text-ink placeholder:text-ink-3",
  "shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_color-mix(in_oklab,var(--ink)_4%,transparent)]",
  "transition-[box-shadow,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
  "hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--ink)_28%,transparent)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand focus-visible:shadow-[0_0_0_1px_var(--brand)]",
  "disabled:cursor-not-allowed disabled:bg-fill disabled:text-ink-3 disabled:shadow-[0_0_0_1px_var(--line)]",
  "aria-[invalid=true]:shadow-[0_0_0_1px_var(--down)] aria-[invalid=true]:focus-visible:outline-down",
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, leading, trailing, ...props }, ref) {
  if (!leading && !trailing) {
    return <input ref={ref} className={cn(controlBase, "h-11 px-3", className)} {...props} />;
  }
  return (
    <div className="relative">
      {leading && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">{leading}</span>}
      <input ref={ref} className={cn(controlBase, "h-11 px-3", leading && "pl-10", trailing && "pr-16", className)} {...props} />
      {trailing && <span className="absolute inset-y-0 right-3 flex items-center text-label text-ink-2">{trailing}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(controlBase, "min-h-32 resize-y px-3 py-3 leading-6", className)} {...props} />;
});
