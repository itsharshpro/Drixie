"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { NumberRoll } from "@/components/ui/number-roll";
import { cn } from "@/lib/cn";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { getJson } from "../../lib/api";
import { DrixieMark } from "@/components/ui/brand";
import { useInView, useReducedMotionSafe } from "../primitives";
import { CheckGlyph } from "../primitives/check-glyph";
import "../primitives/motion.css";

const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL || "";
const X_URL = process.env.NEXT_PUBLIC_X_URL || "";
const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || "http://localhost:4400/mcp";

type FootLink = { label: string; href?: string; external?: boolean; copy?: string };

const COLUMNS: { title: string; links: FootLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Funds", href: "/app" },
      { label: "Stocks", href: "/app/stocks" },
      { label: "Portfolio", href: "/app/portfolio" },
      { label: "Compete", href: "/app/compete" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "The managers", href: "#managers" },
      { label: "Rebalance bell", href: "#bell" },
      { label: "Reputation", href: "#reputation" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Network",
    links: [
      { label: "NEAR", href: "https://near.org", external: true },
      { label: "Economy", href: "/app/economy" },
      { label: "Gallery", href: "/app/gallery" },
      { label: "How Drixie works", href: "/app/guide" },
    ],
  },
  GITHUB_URL || X_URL
    ? {
        title: "Social",
        links: [
          ...(GITHUB_URL ? [{ label: "GitHub", href: GITHUB_URL, external: true }] : []),
          ...(X_URL ? [{ label: "X", href: X_URL, external: true }] : []),
        ],
      }
    : {
        title: "Start",
        links: [
          { label: "Find your fund", href: "/app/start" },
          { label: "Bid for a seat", href: "/app/gallery" },
          { label: "MCP server", copy: MCP_URL },
          { label: "See the funds", href: "/app" },
        ],
      },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-[var(--v4-page,#f7f7fa)]" aria-labelledby="footer-title">
      <h2 id="footer-title" className="sr-only">
        Drixie
      </h2>
      <div className="v4-container relative pt-20 md:pt-24">
        <GiantWordmark />
        <p className="mt-5 text-center text-[14px] text-ink-3 md:mt-6 md:text-[15px]">Back the AI fund manager you trust.</p>

        <nav aria-label="Footer" className="mx-auto mt-16 grid max-w-[920px] grid-cols-2 gap-x-6 gap-y-10 md:mt-20 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col items-center text-center">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{col.title}</h3>
              <ul className="mt-3 flex flex-col items-center">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <FooterLink link={l} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-16 grid grid-cols-1 items-center gap-5 border-t border-line py-8 text-center md:mt-20 lg:grid-cols-[1fr_auto_1fr] lg:text-left">
          <p className="flex items-center justify-center gap-2 text-[13px] text-ink-3 lg:justify-start">
            <DrixieMark size={18} />
            <span>© 2026 Drixie · Built on NEAR</span>
          </p>
          <BackToTop />
          <div className="flex justify-center lg:justify-end">
            <StatusPill />
          </div>
        </div>
      </div>
    </footer>
  );
}

const WORD = ["D", "r", "i", "x", "i", "e"] as const;
const CELL = 0.027; // em (≈6px at 220px)
const ROWS = Math.ceil(1.05 / CELL);

function halftone(color: string, maxR: number, minR: number, power: number): CSSProperties {
  const img: string[] = [];
  const pos: string[] = [];
  const size: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    const t = 1 - r / (ROWS - 1);
    const rad = (minR + (maxR - minR) * Math.pow(t, power)) * CELL;
    img.push(`radial-gradient(circle at 50% 50%, ${color} 0 ${rad.toFixed(4)}em, transparent ${(rad + 0.004).toFixed(4)}em)`);
    pos.push(`${r % 2 ? (CELL / 2).toFixed(4) : 0}em ${(r * CELL).toFixed(4)}em`);
    size.push(`${CELL}em ${CELL}em`);
  }
  return {
    backgroundImage: img.join(","),
    backgroundPosition: pos.join(","),
    backgroundSize: size.join(","),
    backgroundRepeat: "repeat-x",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

const INK_DOTS = halftone("var(--ink)", 0.62, 0.05, 1.6);
const ROYAL_DOTS = halftone("var(--brand)", 0.66, 0.42, 1);

function GiantWordmark() {
  const reduced = useReducedMotionSafe();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref, { margin: "0px 0px -10% 0px" });
  const [lit, setLit] = useState(false);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--sx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };

  const letters = (style: CSSProperties) =>
    WORD.map((ch, i) => (
      <span key={i} className="v4c-rise" style={{ "--i": i } as CSSProperties}>
        <span className="v4c-letter" style={{ ...style, "--i": i } as CSSProperties}>
          {ch}
        </span>
      </span>
    ));
  return (
    <div className="flex justify-center">
      <div
        ref={ref}
        data-art
        aria-hidden
        onPointerMove={onMove}
        onPointerEnter={() => setLit(true)}
        onPointerLeave={() => setLit(false)}
        data-inview={shown ? "true" : "false"}
        className="v4c-wordmark relative select-none whitespace-nowrap px-2 pt-3 font-semibold leading-[0.9] tracking-[-0.03em]"
        style={{ fontSize: "clamp(96px, 26vw, 220px)" }}
      >
        <div>{letters(INK_DOTS)}</div>
        <div
          className={cn("pointer-events-none absolute inset-0 px-2 pt-3 transition-opacity duration-300", !lit && !reduced && "v4c-sweep")}
          style={{
            opacity: lit ? 1 : reduced ? 0 : undefined,
            maskImage: "radial-gradient(circle 0.9em at var(--sx, 50%) var(--sy, 50%), #000 0%, rgba(0,0,0,0.6) 35%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle 0.9em at var(--sx, 50%) var(--sy, 50%), #000 0%, rgba(0,0,0,0.6) 35%, transparent 70%)",
          }}
        >
          {letters(ROYAL_DOTS)}
        </div>
      </div>
    </div>
  );
}

function FooterLink({ link }: { link: FootLink }) {
  const [copied, setCopied] = useState(false);
  const cls = "v4c-link text-[15px]";
  if (link.copy) {
    const value = link.copy;
    return (
      <button
        type="button"
        className={cn(cls, "gap-1.5")}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            },
            () => undefined,
          );
        }}
        aria-label={copied ? "MCP server address copied" : `Copy the MCP server address ${value}`}
      >
        <span className="grid">
          <span className={cn("col-start-1 row-start-1 transition-all duration-200", copied ? "-translate-y-1 opacity-0" : "opacity-100")}>{link.label}</span>
          <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-1 text-up transition-all duration-200", copied ? "opacity-100" : "translate-y-1 opacity-0")}>
            <CheckGlyph size={13} /> Copied
          </span>
        </span>
      </button>
    );
  }
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={cn(cls, "gap-1")}>
        {link.label}
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="opacity-60">
          <path d="M3.5 8.5l5-5M4.5 3.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    );
  }
  return (
    <Link href={link.href ?? "/"} className={cls}>
      {link.label}
    </Link>
  );
}

function BackToTop() {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
        className="group inline-flex h-11 items-center gap-2 rounded-full bg-paper px-4 text-[13px] font-medium text-ink-2 shadow-[0_0_0_1px_var(--line),0_1px_2px_color-mix(in_oklab,var(--ink)_5%,transparent)] transition-all duration-200 hover:-translate-y-0.5 hover:text-ink hover:shadow-[0_0_0_1px_var(--line-strong),0_10px_24px_-14px_color-mix(in_oklab,var(--ink)_35%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="grid size-4 place-items-center overflow-hidden" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 16 16" className="col-start-1 row-start-1 transition-transform duration-300 group-hover:-translate-y-4">
            <path d="M8 13V3.5M4 7.5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 16 16" className="col-start-1 row-start-1 translate-y-4 transition-transform duration-300 group-hover:translate-y-0">
            <path d="M8 13V3.5M4 7.5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        Back to top
      </button>
    </div>
  );
}

interface Health {
  ok: boolean;
  chainHead: number;
  indexerLagBlocks: number;
}

function StatusPill() {
  const health = useQuery({
    queryKey: ["listed", "v4", "health"],
    queryFn: ({ signal }) => getJson<Health>("/health", { signal, timeoutMs: 5000 }),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: 1,
    staleTime: 8000,
  });

  const hydrated = useHydrated();
  const h = hydrated ? health.data : undefined;
  const down = hydrated && health.isError && !h;
  const lagging = h ? !h.ok || h.indexerLagBlocks > 30 : false;
  const label = !h && !down ? "Checking status" : down ? "Status unavailable" : lagging ? "Catching up" : "All systems normal";
  const block = h ? h.chainHead.toLocaleString("en-US") : null;

  return (
    <span
      role="status"
      className="inline-flex h-9 items-center gap-2 rounded-full bg-paper px-3.5 text-[13px] text-ink-2 shadow-[0_0_0_1px_var(--line),0_1px_2px_color-mix(in_oklab,var(--ink)_5%,transparent)]"
    >
      <span className="v4-live" data-tone={down || !h || lagging ? "off" : undefined} aria-hidden />
      <span className="font-medium text-ink">{label}</span>
      {block && !down ? (
        <>
          <span className="text-ink-3" aria-hidden>
            ·
          </span>
          <span className="font-mono tabular-nums">
            block #<NumberRoll value={block} duration={500} rollOnMount={false} label={`block ${block}`} />
          </span>
        </>
      ) : null}
    </span>
  );
}
