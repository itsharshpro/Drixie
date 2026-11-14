import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium",
    "transition-[transform,background-color,box-shadow,color,opacity] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
    "active:scale-[0.98] active:duration-[120ms] disabled:pointer-events-none disabled:active:scale-100",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand text-paper hover:bg-brand/90 disabled:bg-fill disabled:text-ink-3",
        secondary:
          "bg-paper text-ink shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_color-mix(in_oklab,var(--ink)_6%,transparent)] hover:bg-fill disabled:bg-fill disabled:text-ink-3 disabled:shadow-none",
        ghost: "bg-transparent text-ink hover:bg-fill disabled:text-ink-3",
        brand: "bg-brand text-paper hover:bg-brand/90 disabled:bg-fill disabled:text-ink-3",
        up: "bg-up text-paper hover:bg-up/90 disabled:bg-fill disabled:text-ink-3",
        danger: "bg-down text-paper hover:bg-down/90 disabled:bg-fill disabled:text-ink-3",
        destructive: "bg-down text-paper hover:bg-down/90 disabled:bg-fill disabled:text-ink-3",
        link: "h-auto px-0 text-brand underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-9 rounded-control px-3 text-label before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
        md: "h-11 rounded-control px-4 text-body-sm",
        lg: "h-12 rounded-control px-5 text-body",
        icon: "size-11 rounded-control",
        "icon-sm": "size-9 rounded-control before:absolute before:-inset-1 before:content-['']",
      },
      pill: { true: "rounded-full", false: "" },
      block: { true: "w-full", false: "" },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md", pill: false, block: false },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, pill, block, asChild, loading, loadingLabel, children, disabled, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, pill, block }), loading && "pointer-events-none", className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="size-4" label={loadingLabel ?? "Working"} />}
          {loading && loadingLabel ? loadingLabel : children}
        </>
      )}
    </Comp>
  );
});
