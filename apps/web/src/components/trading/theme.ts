export interface TradingTheme {
  ink: string;
  paper: string;
  brand: string;
  up: string; // --candle-up (vivid; candles, volume, flashes)
  down: string; // --candle-down
  upText: string; // --up (text-safe)
  downText: string; // --down
  mono: string;
  sans: string;
}

const FALLBACK: TradingTheme = {
  ink: "#0f1117",
  paper: "#ffffff",
  brand: "#2b44d9",
  up: "#12b886",
  down: "#f0465a",
  upText: "#0a7d53",
  downText: "#d42a3c",
  mono: "ui-monospace, SFMono-Regular, monospace",
  sans: "ui-sans-serif, system-ui, sans-serif",
};

const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

export function readTradingTheme(el: Element | null): TradingTheme {
  if (!el || typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(el);
  const hex = (name: string, fb: string) => {
    const v = cs.getPropertyValue(name).trim();
    return isHex(v) ? v : fb;
  };
  const font = (name: string, fb: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v ? `${v}, ${fb}` : fb;
  };
  return {
    ink: hex("--ink", FALLBACK.ink),
    paper: hex("--paper", FALLBACK.paper),
    brand: hex("--brand", FALLBACK.brand),
    up: hex("--candle-up", FALLBACK.up),
    down: hex("--candle-down", FALLBACK.down),
    upText: hex("--up", FALLBACK.upText),
    downText: hex("--down", FALLBACK.downText),
    mono: font("--font-geist-mono", FALLBACK.mono),
    sans: font("--font-geist-sans", FALLBACK.sans),
  };
}

export function alpha(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return `rgba(15, 17, 23, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
