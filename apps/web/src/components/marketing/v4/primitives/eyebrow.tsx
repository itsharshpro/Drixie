import Link from "next/link";
import type { ReactNode } from "react";

export interface EyebrowProps {
  children: ReactNode;

  live?: boolean | "off";

  arrow?: boolean;
  href?: string;
  className?: string;
}

export function Eyebrow({ children, live, arrow, href, className }: EyebrowProps) {
  const inner = (
    <>
      {live ? <span className="v4-live" data-tone={live === "off" ? "off" : undefined} aria-hidden /> : null}
      <span>{children}</span>
      {arrow ? (
        <svg className="v4-eyebrow-arrow" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 6h7.5M6.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </>
  );
  const cls = ["v4-eyebrow", className].filter(Boolean).join(" ");
  if (href) {
    const internal = href.startsWith("/") || href.startsWith("#");
    return internal ? (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    ) : (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return <span className={cls}>{inner}</span>;
}
