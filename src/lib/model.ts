// 13-week direct cash flow model with scenario sensitivities, a revolving credit
// facility (RCF) that draws to protect minimum cash, and a liquidity covenant test.

import { createContext, useContext } from "react";

export const WEEKS = 13;

export const RECEIPT_CATEGORIES = ["Collections – existing receivables", "Collections – new sales", "Other receipts"] as const;
export const PAYMENT_CATEGORIES = [
  "Payroll",
  "Fuel",
  "Suppliers & operating costs",
  "Maintenance",
  "Leases & rent",
  "Taxes",
  "Debt service",
  "Capex",
  "Other payments"
] as const;
export type Category = (typeof RECEIPT_CATEGORIES)[number] | (typeof PAYMENT_CATEGORIES)[number];

export type Line = {
  name: string;
  type: "receipt" | "payment";
  category: Category;
  weeks: number[]; // 13 values, always positive; payments are subtracted
};

export type Settings = {
  company: string;
  currency: string;
  startDate: string; // Monday of week 1 (ISO)
  openingCash: number;
  minimumCash: number;
  rcfLimit: number;
  rcfDrawn: number;
  rcfRatePct: number;
  covenantMinLiquidity: number;
};

export type Forecast = { source: "sample" | "upload"; label: string; settings: Settings; lines: Line[] };

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export type Drivers = {
  salesPct: number; // change in sales volume: new-sales collections, and fuel through activity
  delayDays: number; // collections arrive this many days later (negative = earlier)
  badDebtPct: number; // share of opening receivables never collected
  fuelPct: number; // fuel price change
  costSavingsPct: number; // saving on suppliers and other payments (negative = overrun)
  capexDeferWeeks: number; // capex pushed back by this many weeks
};

export type ScenarioKey = "best" | "base" | "worst";
export const SCENARIOS: ScenarioKey[] = ["best", "base", "worst"];
export const SCENARIO_LABEL: Record<ScenarioKey, string> = { best: "Best case", base: "Base case", worst: "Worst case" };

export const DEFAULT_DRIVERS: Record<ScenarioKey, Drivers> = {
  best: { salesPct: 10, delayDays: -5, badDebtPct: 0, fuelPct: -10, costSavingsPct: 5, capexDeferWeeks: 0 },
  base: { salesPct: 0, delayDays: 0, badDebtPct: 0, fuelPct: 0, costSavingsPct: 0, capexDeferWeeks: 0 },
  worst: { salesPct: -25, delayDays: 21, badDebtPct: 5, fuelPct: 25, costSavingsPct: -5, capexDeferWeeks: 0 }
};

export const DRIVER_SPECS: { key: keyof Drivers; label: string; help: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "salesPct", label: "Sales volume", help: "Changes collections from new sales, and fuel use with activity", min: -50, max: 30, step: 1, unit: "%" },
  { key: "delayDays", label: "Collection delay", help: "Customers pay this many days later (negative = sooner)", min: -14, max: 45, step: 1, unit: " days" },
  { key: "badDebtPct", label: "Bad debt", help: "Share of opening receivables that is never collected", min: 0, max: 30, step: 1, unit: "%" },
  { key: "fuelPct", label: "Fuel price", help: "Change in the price of fuel", min: -30, max: 60, step: 1, unit: "%" },
  { key: "costSavingsPct", label: "Cost savings", help: "Savings on suppliers and other payments (negative = overrun)", min: -20, max: 20, step: 1, unit: "%" },
  { key: "capexDeferWeeks", label: "Capex deferral", help: "Push capital spending back by this many weeks", min: 0, max: 13, step: 1, unit: " wks" }
];

const FUEL_ACTIVITY_SHARE = 0.7; // share of fuel spend that moves with flying activity

/** Move a weekly series later by a fractional number of weeks; what falls past week 13 is lost from the window */
function shift(values: number[], weeks: number) {
  const out = new Array(WEEKS).fill(0);
  const whole = Math.floor(weeks);
  const frac = weeks - whole;
  values.forEach((v, i) => {
    const a = i + whole;
    const parts: [number, number][] = [
      [a, v * (1 - frac)],
      [a + 1, v * frac]
    ];
    for (const [w, amount] of parts) {
      if (!amount) continue;
      if (w < 0) out[0] += amount; // can't collect before week 1
      else if (w < WEEKS) out[w] += amount;
    }
  });
  return out;
}

/**
 * Late payment: customers don't all slip by the same amount, so each week's receipts are
 * spread evenly over the following weeks with an average delay of `weeks`.
 */
function spreadLater(values: number[], weeks: number) {
  const span = 2 * weeks; // uniform over [0, span] weeks has a mean of `weeks`
  const out = new Array(WEEKS).fill(0);
  values.forEach((v, i) => {
    for (let j = 0; j - 0.5 < span; j++) {
      const share = (Math.min(j + 0.5, span) - Math.max(j - 0.5, 0)) / span;
      if (share > 0 && i + j < WEEKS) out[i + j] += v * share;
    }
  });
  return out;
}

export function applyDrivers(lines: Line[], d: Drivers): Line[] {
  return lines.map((l) => {
    let w = [...l.weeks];
    switch (l.category) {
      case "Collections – existing receivables":
        w = w.map((v) => v * (1 - d.badDebtPct / 100));
        break;
      case "Collections – new sales":
        w = w.map((v) => v * (1 + d.salesPct / 100));
        break;
      case "Fuel":
        w = w.map((v) => v * (1 + d.fuelPct / 100) * (1 + (FUEL_ACTIVITY_SHARE * d.salesPct) / 100));
        break;
      case "Suppliers & operating costs":
      case "Other payments":
        w = w.map((v) => v * (1 - d.costSavingsPct / 100));
        break;
      case "Capex":
        w = shift(w, d.capexDeferWeeks);
        break;
    }
    if (l.category.startsWith("Collections")) w = d.delayDays > 0 ? spreadLater(w, d.delayDays / 7) : shift(w, d.delayDays / 7);
    return { ...l, weeks: w };
  });
}

// ---------------------------------------------------------------------------
// Running the forecast week by week
// ---------------------------------------------------------------------------

export type WeekResult = {
  week: number;
  start: string; // week commencing (ISO)
  label: string; // "5 Oct"
  openingCash: number;
  receipts: number;
  payments: number;
  operatingFlow: number;
  rcfInterest: number;
  rcfMovement: number; // + draw, − repayment
  closingCash: number;
  rcfBalance: number;
  undrawn: number;
  liquidity: number;
  headroom: number; // liquidity − covenant
  breach: boolean;
  shortfall: number; // cash below minimum even with the facility fully drawn
};

export type ScenarioResult = {
  key: ScenarioKey;
  drivers: Drivers;
  lines: Line[];
  weeks: WeekResult[];
  byCategory: { category: Category; type: "receipt" | "payment"; total: number }[];
  summary: {
    endingCash: number;
    lowestCash: number;
    lowestWeek: number;
    peakRcf: number;
    peakRcfWeek: number;
    minHeadroom: number;
    minHeadroomWeek: number;
    breachWeeks: number[];
    totalShortfall: number;
    netOperating: number;
    totalInterest: number;
    receipts: number;
    payments: number;
  };
};

const addDays = (iso: string, days: number) => new Date(Date.parse(iso + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
const shortDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The facility is drawn to keep cash at the minimum, and repaid from cash above 1.5× the minimum */
export const REPAY_ABOVE_MULTIPLE = 1.5;

export function runScenario(forecast: Forecast, key: ScenarioKey, drivers: Drivers): ScenarioResult {
  const s = forecast.settings;
  const lines = applyDrivers(forecast.lines, drivers);
  const weeks: WeekResult[] = [];
  let cash = s.openingCash;
  let rcf = Math.min(s.rcfDrawn, s.rcfLimit);

  for (let w = 0; w < WEEKS; w++) {
    const receipts = lines.filter((l) => l.type === "receipt").reduce((t, l) => t + l.weeks[w], 0);
    const payments = lines.filter((l) => l.type === "payment").reduce((t, l) => t + l.weeks[w], 0);
    const operatingFlow = receipts - payments;
    const rcfInterest = (rcf * s.rcfRatePct) / 100 / 52;
    const opening = cash;
    let closing = opening + operatingFlow - rcfInterest;

    let movement = 0;
    if (closing < s.minimumCash) {
      movement = Math.min(s.minimumCash - closing, s.rcfLimit - rcf);
    } else if (rcf > 0 && closing > s.minimumCash * REPAY_ABOVE_MULTIPLE) {
      movement = -Math.min(rcf, closing - s.minimumCash * REPAY_ABOVE_MULTIPLE);
    }
    rcf += movement;
    closing += movement;
    cash = closing;

    const undrawn = s.rcfLimit - rcf;
    const liquidity = closing + undrawn;
    const start = addDays(s.startDate, w * 7);
    weeks.push({
      week: w + 1,
      start,
      label: shortDate(start),
      openingCash: opening,
      receipts,
      payments,
      operatingFlow,
      rcfInterest,
      rcfMovement: movement,
      closingCash: closing,
      rcfBalance: rcf,
      undrawn,
      liquidity,
      headroom: liquidity - s.covenantMinLiquidity,
      breach: liquidity < s.covenantMinLiquidity - 0.5,
      shortfall: Math.max(0, s.minimumCash - closing)
    });
  }

  const cats = [...RECEIPT_CATEGORIES, ...PAYMENT_CATEGORIES] as Category[];
  const byCategory = cats
    .map((category) => {
      const ls = lines.filter((l) => l.category === category);
      return { category, type: ls[0]?.type ?? ((RECEIPT_CATEGORIES as readonly string[]).includes(category) ? "receipt" : "payment"), total: ls.reduce((t, l) => t + l.weeks.reduce((a, b) => a + b, 0), 0) };
    })
    .filter((c) => Math.abs(c.total) > 0.5) as ScenarioResult["byCategory"];

  const lowest = weeks.reduce((m, w) => (w.closingCash < m.closingCash ? w : m), weeks[0]);
  const peak = weeks.reduce((m, w) => (w.rcfBalance > m.rcfBalance ? w : m), weeks[0]);
  const tight = weeks.reduce((m, w) => (w.headroom < m.headroom ? w : m), weeks[0]);
  const sum = (f: (w: WeekResult) => number) => weeks.reduce((t, w) => t + f(w), 0);

  return {
    key,
    drivers,
    lines,
    weeks,
    byCategory,
    summary: {
      endingCash: weeks[WEEKS - 1].closingCash,
      lowestCash: lowest.closingCash,
      lowestWeek: lowest.week,
      peakRcf: Math.max(peak.rcfBalance, s.rcfDrawn),
      peakRcfWeek: peak.week,
      minHeadroom: tight.headroom,
      minHeadroomWeek: tight.week,
      breachWeeks: weeks.filter((w) => w.breach).map((w) => w.week),
      totalShortfall: Math.max(...weeks.map((w) => w.shortfall)),
      netOperating: sum((w) => w.operatingFlow),
      totalInterest: sum((w) => w.rcfInterest),
      receipts: sum((w) => w.receipts),
      payments: sum((w) => w.payments)
    }
  };
}

export type Model = {
  forecast: Forecast;
  drivers: Record<ScenarioKey, Drivers>;
  results: Record<ScenarioKey, ScenarioResult>;
  selected: ScenarioKey;
};

export const ModelContext = createContext<Model | null>(null);

export function useModel(): Model {
  const m = useContext(ModelContext);
  if (!m) throw new Error("useModel must be used inside ModelContext");
  return m;
}
