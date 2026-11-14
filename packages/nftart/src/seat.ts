import type { FundId } from "@listed/shared";
import { A, DOWN, GOLD, GOLD_TEXT, INK, PAPER, UP, fundTheme } from "./palette";
import {
  approxWidth,
  document,
  drixieLockup,
  fundMark,
  halftoneFade,
  halftoneRings,
  idFrom,
  n,
  pill,
  finite,
  rule,
  shortAccount,
  text,
  usdCompact,
  type RenderOptions,
} from "./svg";

export interface SeatCardData {
  fund: FundId;
  name: string;
  mandate?: string | null;

  seatNo?: number | null;
  seats?: number | null;
  season?: number | null;

  holder?: string | null;
  owner?: string | null;

  feesEarnedUsd?: number | null;
  fundValueUsd?: number | null;
  reputation?: number | null;

  auctionOpen?: boolean;
}

export const SEAT_W = 800;
export const SEAT_H = 1000;

function repTone(score: number): string {
  return score < 40 ? DOWN : score < 60 ? GOLD : UP;
}

export function renderSeatCard(input: SeatCardData, opts: RenderOptions = {}): string {
  const d = {
    ...input,
    holder: input.holder ?? input.owner ?? null,
    mandate: input.mandate ?? "",
    feesEarnedUsd: finite(input.feesEarnedUsd),
    fundValueUsd: finite(input.fundValueUsd),
    reputation: finite(input.reputation),
  };
  const theme = fundTheme(d.fund);
  const id = opts.idPrefix ?? idFrom(`seat|${d.fund}`);
  const W = SEAT_W;
  const cx = W / 2;
  const parts: string[] = [];

  parts.push(`<rect width="${W}" height="556" fill="${theme.pastel}" data-art="band"/>`);
  parts.push(halftoneFade(0, W, 556, 6, 11, theme.pastel, 5, 0.9));
  parts.push(halftoneRings(cx, 236, 126, 5, 16, theme.deep, 3.4, 1, 0.42));
  parts.push(fundMark(d.fund, cx - 92, 144, 184, theme.deep));
  if (d.seatNo) {
    const label = d.seats ? `Seat ${d.seatNo} of ${d.seats}` : `Seat ${d.seatNo}`;
    const w = approxWidth(label, 16) + 32;
    parts.push(pill(48 + w / 2, 48, label, { size: 16, padX: 16, height: 40 }));
  }
  if (d.season) {
    const label = `Season ${d.season}`;
    const w = approxWidth(label, 16) + 32;
    parts.push(pill(W - 48 - w / 2, 48, label, { size: 16, padX: 16, height: 40 }));
  }
  parts.push(text(cx, 432, "Manager seat", { size: 14, weight: 600, anchor: "middle", opacity: A.ink2, track: 0.1, upper: true }));
  parts.push(text(cx, 496, d.name, { size: 64, weight: 600, anchor: "middle", track: -0.03 }));
  parts.push(text(cx, 532, d.mandate, { size: 18, anchor: "middle", opacity: A.ink2 }));

  const px = 48;
  const py = 636;
  const pw = W - 96;
  const ph = 212;
  parts.push(`<rect x="${px + 0.5}" y="${py + 0.5}" width="${pw - 1}" height="${ph - 1}" rx="24" fill="${PAPER}" stroke="${INK}" stroke-opacity="${A.line}"/>`);
  parts.push(`<path d="M${cx + 0.5} ${py + 24}V${py + ph - 24}M${px + 24} ${py + ph / 2 + 0.5}H${px + pw - 24}" stroke="${INK}" stroke-opacity="${A.line}"/>`);
  const cell = (col: number, row: number, label: string, value: string, o: { fill?: string; mono?: boolean; size?: number; dot?: string } = {}) => {
    const x = px + 32 + col * (pw / 2);
    const y = py + row * (ph / 2);
    let s = text(x, y + 42, label, { size: 15, opacity: A.ink2 });
    const vx = o.dot ? x + 22 : x;
    if (o.dot) s += `<circle cx="${n(x + 7)}" cy="${n(y + 74)}" r="7" fill="${o.dot}"/>`;
    s += text(vx, y + 84, value, { size: o.size ?? 32, weight: 600, mono: o.mono ?? true, fill: o.fill ?? INK, track: -0.01 });
    return s;
  };
  parts.push(cell(0, 0, "Fees earned", d.feesEarnedUsd === null ? "—" : usdCompact(d.feesEarnedUsd), { fill: d.feesEarnedUsd ? GOLD_TEXT : INK }));
  parts.push(cell(1, 0, "Fund value", d.fundValueUsd === null ? "—" : usdCompact(d.fundValueUsd)));
  parts.push(
    d.reputation === null
      ? cell(0, 1, "Reputation", "—")
      : cell(0, 1, "Reputation", `${Math.round(d.reputation * 10) / 10}`, { dot: repTone(d.reputation) }),
  );
  const holder = d.auctionOpen ? "Up for auction" : d.holder ? shortAccount(d.holder, 22) : "Unclaimed";
  parts.push(cell(1, 1, "Holder", holder, { mono: Boolean(d.holder) && !d.auctionOpen, size: d.holder && !d.auctionOpen ? 22 : 28 }));

  parts.push(text(cx, 886, "Earns 30% of the fees on user capital.", { size: 16, anchor: "middle", opacity: A.ink2 }));
  parts.push(rule(48, W - 48, 912));
  parts.push(drixieLockup(48, 936, 24).svg);
  parts.push(text(W - 48, 954, "testnet simulation", { size: 13, anchor: "end", opacity: A.ink3 }));

  return document(
    {
      width: W,
      height: SEAT_H,
      title: `${d.name} manager seat`,
      desc: `The ${d.name} manager seat on Drixie: earns 30% of the fees on user capital.${d.holder ? ` Held by ${d.holder}.` : ""}`,
      body: parts.join(""),
      opts,
    },
    `${id}-clip`,
  );
}
