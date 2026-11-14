"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { useRef, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from "react";
import { useReducedMotionSafe } from "../../lib/use-reduced-motion";

export interface MagneticButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;

  variant?: "royal" | "ink" | "outline" | "ghost";
  size?: "md" | "sm";
  shape?: "rounded" | "pill";

  arrow?: boolean;

  strength?: number;
  className?: string;
  "aria-label"?: string;
  type?: "button" | "submit";
}

const MotionLink = motion.create(Link);

export function MagneticButton({
  children,
  href,
  onClick,
  variant = "royal",
  size = "md",
  shape = "rounded",
  arrow,
  strength = 8,
  className,
  type = "button",
  ...rest
}: MagneticButtonProps) {
  const reduced = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 260, damping: 18, mass: 0.4 });
  const y = useSpring(my, { stiffness: 260, damping: 18, mass: 0.4 });
  const lx = useTransform(x, (v) => v * 0.45);
  const ly = useTransform(y, (v) => v * 0.45);

  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    mx.set(Math.max(-1, Math.min(1, dx)) * strength);
    my.set(Math.max(-1, Math.min(1, dy)) * strength * 0.6);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  const showArrow = arrow ?? (variant === "royal" || variant === "ink");
  const cls = ["v4-btn", `v4-btn-${variant}`, className].filter(Boolean).join(" ");
  const body = (
    <motion.span className="inline-flex items-center gap-2.5" style={{ x: lx, y: ly }}>
      {children}
      {showArrow ? (
        <span className="v4-btn-arrow" aria-hidden>
          <span>
            <ArrowGlyph />
          </span>
          <span>
            <ArrowGlyph />
          </span>
        </span>
      ) : null}
    </motion.span>
  );
  const common = {
    className: cls,
    "data-size": size === "sm" ? "sm" : undefined,
    "data-shape": shape === "pill" ? "pill" : undefined,
    style: { x, y },
    whileTap: reduced ? undefined : { scale: 0.98 },
    onPointerMove: onMove,
    onPointerLeave: onLeave,
    onClick,
    ...rest,
  };

  if (href) {

    const plain = /^https?:/.test(href) || href.startsWith("#");
    if (plain) {
      return (
        <motion.a ref={ref as Ref<HTMLAnchorElement>} href={href} {...common}>
          {body}
        </motion.a>
      );
    }
    return (
      <MotionLink ref={ref as Ref<HTMLAnchorElement>} href={href} {...common}>
        {body}
      </MotionLink>
    );
  }
  return (
    <motion.button ref={ref as Ref<HTMLButtonElement>} type={type} {...common}>
      {body}
    </motion.button>
  );
}

function ArrowGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
