import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { controlBase } from "./input";

export interface SelectOption {
  value: string;
  label: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[] }>(
  function Select({ className, options, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(controlBase, "h-11 appearance-none pl-3 pr-10", className)} {...props}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" aria-hidden />
      </div>
    );
  },
);
