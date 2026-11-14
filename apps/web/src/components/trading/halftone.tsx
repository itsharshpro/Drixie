"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { styles } from "./styles";

export const halftoneHost = styles.rippleHost;

export interface HalftoneProps {

  rows?: number;

  cell?: number;

  color?: string;

  opacity?: number;

  fade?: "up" | "down";

  ripple?: boolean;
  className?: string;
}

export function Halftone({ rows = 6, cell = 10, color = "var(--ink)", opacity = 0.18, fade = "up", ripple, className }: HalftoneProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const cols = Math.max(0, Math.ceil(size.width / cell) + 1);
  const height = rows * cell;

  const dots = useMemo(() => {
    const out: { x: number; y: number; r: number; c: number; row: number }[] = [];
    const maxR = cell * 0.42;
    const minR = cell * 0.07;
    for (let row = 0; row < rows; row++) {

      const t = rows === 1 ? 1 : fade === "up" ? row / (rows - 1) : 1 - row / (rows - 1);
      const r = minR + (maxR - minR) * Math.pow(t, 1.35);
      const shift = row % 2 ? cell / 2 : 0;
      for (let c = 0; c < cols; c++) out.push({ x: c * cell + shift, y: row * cell + cell / 2, r, c, row: fade === "up" ? rows - 1 - row : row });
    }
    return out;
  }, [rows, cols, cell, fade]);

  return (
    <div
      ref={ref}
      data-art
      aria-hidden
      className={cn("pointer-events-none relative w-full overflow-hidden", ripple && cn(styles.rippleHost, "pointer-events-auto"), className)}
      style={{ height, opacity }}
    >
      {size.width > 0 && (
        <svg width={size.width} height={height} className="block" fill={color}>
          {dots.map((d) => (
            <circle
              key={`${d.c}-${d.row}`}
              className={styles.dot}
              cx={d.x}
              cy={d.y}
              r={d.r}
              style={{ ["--c" as string]: d.c, ["--r" as string]: d.row }}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
