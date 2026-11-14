"use client";

import QRCode from "qrcode";
import { useMemo } from "react";
import { cn } from "@/lib/cn";

export function QrCode({ value, size = 168, className, label }: { value: string; size?: number; className?: string; label: string }) {
  const { path, n } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const count = qr.modules.size;
    let d = "";
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) if (qr.modules.get(x, y)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    }
    return { path: d, n: count + 4 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn("rounded-control bg-paper", className)}
    >
      <path d={path} className="fill-ink" />
    </svg>
  );
}
