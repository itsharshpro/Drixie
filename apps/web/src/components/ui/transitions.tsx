"use client";

import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import {
  Children,
  Suspense,
  ViewTransition,
  createContext,
  isValidElement,
  startTransition,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE, SPRING } from "@/lib/motion";

export const NAV = {
  forward: ["nav-forward"],
  back: ["nav-back"],

  lateral: ["nav-lateral"],
} as const satisfies Record<string, string[]>;

export type NavDirection = keyof typeof NAV;

const PAGE_CLASSES = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "nav-lateral": "nav-lateral",
  default: "none",
};

export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ViewTransition enter={PAGE_CLASSES} exit={PAGE_CLASSES} default="none">
      <div className={cn("min-w-0", className)}>{children}</div>
    </ViewTransition>
  );
}

type RevealProps = {

  fallback: ReactNode;
  className?: string;
} & (
  | {

      ready?: undefined;
      children: ReactNode;
    }
  | {

      ready: boolean;
      children: ReactNode | (() => ReactNode);
    }
);

export function Reveal(props: RevealProps) {
  if (props.ready === undefined) {
    return (
      <Suspense
        fallback={
          <ViewTransition exit="slide-down" default="none">
            <div className={props.className}>{props.fallback}</div>
          </ViewTransition>
        }
      >
        <ViewTransition enter="slide-up" default="none">
          <div className={props.className}>{props.children}</div>
        </ViewTransition>
      </Suspense>
    );
  }
  return <MotionReveal ready={props.ready} fallback={props.fallback} className={props.className}>{props.children}</MotionReveal>;
}

const EXIT_S = 0.15;
const ENTER_S = 0.21;
const MOVE_S = 0.4;

function MotionReveal({
  ready,
  fallback,
  children,
  className,
}: {
  ready: boolean;
  fallback: ReactNode;
  children: ReactNode | (() => ReactNode);
  className?: string;
}) {
  const reduce = useReducedMotion();
  const dy = reduce ? 0 : 10;
  return (

    <div className={cn("grid [&>*]:[grid-area:1/1] [&>*]:min-w-0", className)}>
      <AnimatePresence initial={false}>
        {ready ? (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: dy, filter: reduce ? "none" : "blur(3px)" }}
            animate={{
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: {
                opacity: { duration: ENTER_S, delay: EXIT_S, ease: "easeIn" },
                filter: { duration: ENTER_S, delay: EXIT_S, ease: "easeIn" },
                y: { duration: MOVE_S, ease: EASE },
              },
            }}

            exit={{ opacity: 0, transition: { duration: 0 } }}
          >
            {typeof children === "function" ? children() : children}
          </motion.div>
        ) : (
          <motion.div
            key="fallback"
            initial={{ opacity: 1 }}
            exit={{
              opacity: 0,
              y: dy,
              filter: reduce ? "none" : "blur(3px)",
              transition: { duration: EXIT_S, ease: "easeOut" },
            }}
          >
            {fallback}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Crossfade({
  value,
  children,
  className,
}: {
  value: string | number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ViewTransition key={String(value)} enter="fade-in" exit="fade-out" default="none">
      <div className={className}>{children}</div>
    </ViewTransition>
  );
}

export function useTransitionState<T>(initial: T | (() => T)) {
  const [value, setValue] = useState<T>(initial);
  const [pending, start] = useTransition();
  const set = useCallback((next: T | ((prev: T) => T)) => start(() => setValue(next)), []);
  return [value, set, pending] as const;
}

export function transition(fn: () => void) {
  startTransition(fn);
}

export type SharedKind =
  | "company-mark"
  | "company-name"
  | "company-price"
  | "company-chart"
  | "charter"
  | "kpi"
  | "fund-mark"
  | "fund-name"
  | "fund-nav"
  | "fund-chart";

export function sharedName(kind: SharedKind, id: string): string {
  return `${kind}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export function SharedElement({
  kind,
  id,
  children,
}: {
  kind: SharedKind;
  id: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition name={sharedName(kind, id)} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

const LIST_TAGS = { div: motion.div, ul: motion.ul, ol: motion.ol, tbody: motion.tbody } as const;
const ITEM_TAGS = { div: motion.div, li: motion.li, tr: motion.tr, article: motion.article } as const;

const ListOrder = createContext<string | undefined>(undefined);

function keySignature(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) => (isValidElement(c) ? String(c.key) : ""))
    .join("|");
}

export function AnimatedList({
  as = "div",
  appear = false,
  className,
  children,
  ...rest
}: {
  as?: keyof typeof LIST_TAGS;
  appear?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<HTMLMotionProps<"div">, "children" | "className">) {
  const Tag = LIST_TAGS[as] as typeof motion.div;
  const order = keySignature(children);
  return (
    <ListOrder.Provider value={order}>
      <Tag layoutRoot className={className} {...rest}>
        <AnimatePresence initial={appear}>{children}</AnimatePresence>
      </Tag>
    </ListOrder.Provider>
  );
}

export function AnimatedItem({
  as = "div",
  index = 0,
  className,
  children,
  layout = true,
  ...rest
}: {
  as?: keyof typeof ITEM_TAGS;

  index?: number;
  className?: string;
  children: ReactNode;
  layout?: boolean;
} & Omit<HTMLMotionProps<"div">, "children" | "className" | "layout">) {
  const reduce = useReducedMotion();
  const order = useContext(ListOrder);
  const Tag = ITEM_TAGS[as] as typeof motion.div;
  const delay = Math.min(index, 8) * 0.03;
  return (
    <Tag
      className={className}
      layout={reduce ? false : layout ? "position" : false}

      layoutDependency={order}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: EXIT_S, ease: EASE } }}
      transition={{
        opacity: { duration: DUR.standard, ease: EASE, delay },
        y: { duration: DUR.emphasis, ease: EASE, delay },
        layout: SPRING,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SwapText({ value, className }: { value: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={cn("inline-grid [&>*]:[grid-area:1/1]", className)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: reduce ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -4 }}
          transition={{ duration: DUR.micro, ease: EASE }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
