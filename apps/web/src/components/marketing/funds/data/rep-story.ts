import { ReputationEngine, type ReputationChange, type ReputationInput } from "../../../../../../../packages/reputation/src/index";

export const STORY_FUNDS = { steady: "Steady", manipulator: "Manipulator" } as const;
export type StoryFund = keyof typeof STORY_FUNDS;

const DAY = 86_400_000;
const BELL = 900_000; // 15-minute bells, as on testnet
const T0 = Date.UTC(2026, 0, 5, 14, 30); // a fixed Monday: the story is deterministic
const at = (day: number, bell: number) => T0 + day * DAY + bell * BELL;
const close = (day: number) => T0 + day * DAY + 9 * 3_600_000; // late in the same day

type W = Record<string, number>;
const STEADY0: W = { AAPL: 1000, MSFT: 1000, JPM: 1000, V: 1000, COST: 1000, KO: 1000, LLY: 1000, AMZN: 1000, XOM: 1000, NVDA: 1000 };
const MANIP0: W = { NVDA: 1000, AMD: 1000, AVGO: 1000, TSM: 1000, META: 1000, TSLA: 1000, PFE: 1000, KO: 1000, MU: 1000, AMZN: 1000 };
const move = (w: W, d: W): W => {
  const out = { ...w };
  for (const [k, v] of Object.entries(d)) out[k] = (out[k] ?? 0) + v;
  return out;
};

export interface Beat {
  key: string;

  chip: string;

  fund: StoryFund;
  caption: string;
  inputs: ReputationInput[];
}

function beats(): Beat[] {
  let s = STEADY0;
  let m = MANIP0;
  const reb = (fund: StoryFund, day: number, bell: number, w: W): ReputationInput => ({ type: "rebalance", fund, bell: day * 96 + bell, at: at(day, bell), weights: w, cashBps: 0 });
  const steady = (day: number, bell: number, d: W) => reb("steady", day, bell, (s = move(s, d)));
  const manip = (day: number, bell: number, d: W) => reb("manipulator", day, bell, (m = move(m, d)));
  const quarter = (q: number, day: number, steadyBps: number, manipBps: number, spyBps: number): ReputationInput => ({
    type: "quarter_close",
    quarter: q,
    at: close(day),
    spyReturnBps: spyBps,
    results: [
      { fund: "steady", returnBps: steadyBps },
      { fund: "manipulator", returnBps: manipBps },
    ],
  });

  return [
    {
      key: "start",
      chip: "Start",
      fund: "steady",
      caption: "Two funds open the season at 60. Outsiders hold 18% of each coin.",
      inputs: [
        { type: "fund_created", fund: "steady", at: at(0, 0), weights: STEADY0, cashBps: 0 },
        { type: "fund_created", fund: "manipulator", at: at(0, 0), weights: MANIP0, cashBps: 0 },
        { type: "holders", fund: "steady", at: at(0, 0), outsideBps: 1800 },
        { type: "holders", fund: "manipulator", at: at(0, 0), outsideBps: 1800 },
      ],
    },
    {
      key: "flip",
      chip: "Flip-flop",
      fund: "manipulator",
      caption: "Manipulator doubles TSLA, then sells it back two bells later, with outsiders watching.",
      inputs: [manip(0, 1, { TSLA: 1000, MU: -500, PFE: -500 }), manip(0, 3, { TSLA: -1000, MU: 500, PFE: 500 })],
    },
    {
      key: "front",
      chip: "Front-running",
      fund: "manipulator",
      caption: "Three times, Steady reveals a buy and Manipulator copies it at the very next bell.",
      inputs: [
        steady(0, 4, { NVDA: 500, XOM: -500 }),
        manip(0, 5, { NVDA: 600, MU: -600 }),
        steady(0, 6, { AMZN: 500, JPM: -500 }),
        manip(0, 7, { AMZN: 600, PFE: -600 }),
        steady(0, 8, { KO: 500, V: -500 }),
        manip(0, 9, { KO: 600, AVGO: -600 }),
      ],
    },
    {
      key: "q1",
      chip: "Quarter 1 closes",
      fund: "steady",
      caption: "Steady traded little and beat SPY. +0.5 and +3, but gains are capped at +2 a day.",
      inputs: [quarter(1, 0, 140, 30, 80)],
    },
    {
      key: "pump",
      chip: "Pump & dump",
      fund: "manipulator",
      caption: "Manipulator buys Steady's coin, then dumps all of it at a profit the same day.",
      inputs: [
        { type: "cross_trade", fund: "manipulator", target: "steady", side: "buy", usd: 40_000, coins: 3_960, fundValueUsd: 1_500_000, at: at(1, 2), bell: 98, id: "story-buy" },
        { type: "cross_trade", fund: "manipulator", target: "steady", side: "sell", usd: 43_600, coins: 3_960, fundValueUsd: 1_510_000, at: at(1, 9), bell: 105, id: "story-sell" },
        quarter(2, 1, 95, -60, 50),
      ],
    },
    {
      key: "q3",
      chip: "Quarters 2 and 3",
      fund: "steady",
      caption: "Steady keeps beating SPY. Trust comes back slowly: never more than +2 a day.",
      inputs: [quarter(3, 2, 120, -150, 40)],
    },
    {
      key: "promise",
      chip: "Missed promise",
      fund: "manipulator",
      caption: "Season end: Manipulator promised +12% and delivered −4%. Its bond is burned to pay investors.",
      inputs: [
        quarter(4, 3, 110, -220, 60),
        { type: "promise", fund: "manipulator", season: 1, kept: false, targetBps: 1200, actualBps: -400, at: close(3) + 60_000 },
      ],
    },
  ];
}

export interface StoryFrame {
  key: string;
  chip: string;
  fund: StoryFund;
  caption: string;

  changes: ReputationChange[];

  scores: Record<StoryFund, number>;
}

export function runStory(): StoryFrame[] {
  const engine = new ReputationEngine({
    names: { ...STORY_FUNDS },
    allowancePct: { steady: 80, manipulator: 80 },
    dayMs: DAY,
    quarterMs: DAY,
  });
  return beats().map((b) => {
    const changes = engine.applyAll(b.inputs);
    const sc = Object.fromEntries(engine.scores().map((r) => [r.fund, r.score])) as Record<string, number>;
    return {
      key: b.key,
      chip: b.chip,
      fund: b.fund,
      caption: b.caption,
      changes,
      scores: { steady: sc.steady ?? 60, manipulator: sc.manipulator ?? 60 },
    };
  });
}
