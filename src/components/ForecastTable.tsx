import { useState } from "react";
import { currencyCode, thousands } from "../lib/format";
import { SCENARIO_LABEL, useModel, WEEKS, type Line } from "../lib/model";

type Row =
  | { kind: "section"; label: string }
  | { kind: "values"; label: string; values: number[]; total?: number | null; style?: "bold" | "sub" | "muted"; negative?: boolean; flag?: (v: number) => boolean }
  | { kind: "spacer" };

const sumWeeks = (lines: Line[]) => Array.from({ length: WEEKS }, (_, i) => lines.reduce((t, l) => t + l.weeks[i], 0));
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Group lines by category, keeping the order they first appear */
function byCategory(lines: Line[]): Line[] {
  const groups = new Map<string, Line[]>();
  for (const l of lines) groups.set(l.category, [...(groups.get(l.category) ?? []), l]);
  return [...groups.entries()].map(([category, ls]) => ({ name: category, type: ls[0].type, category: ls[0].category, weeks: sumWeeks(ls) }));
}

export function ForecastTable() {
  const { results, selected, forecast } = useModel();
  const [grouped, setGrouped] = useState(forecast.lines.length > 15);
  const r = results[selected];
  const s = forecast.settings;
  const w = r.weeks;
  const lines = grouped ? byCategory(r.lines) : r.lines;
  const receipts = lines.filter((l) => l.type === "receipt");
  const payments = lines.filter((l) => l.type === "payment");

  const rows: Row[] = [
    { kind: "values", label: "Opening cash", values: w.map((x) => x.openingCash), total: s.openingCash, style: "bold" },
    { kind: "section", label: "Receipts" },
    ...receipts.map((l): Row => ({ kind: "values", label: l.name, values: l.weeks, total: total(l.weeks), style: "sub" })),
    { kind: "values", label: "Total receipts", values: w.map((x) => x.receipts), total: r.summary.receipts, style: "bold" },
    { kind: "section", label: "Payments" },
    ...payments.map((l): Row => ({ kind: "values", label: l.name, values: l.weeks.map((v) => -v), total: -total(l.weeks), style: "sub" })),
    { kind: "values", label: "Total payments", values: w.map((x) => -x.payments), total: -r.summary.payments, style: "bold" },
    { kind: "spacer" },
    { kind: "values", label: "Net operating cash flow", values: w.map((x) => x.operatingFlow), total: r.summary.netOperating, style: "bold" },
    { kind: "values", label: "Facility interest", values: w.map((x) => -x.rcfInterest), total: -r.summary.totalInterest },
    { kind: "values", label: "Facility drawn / (repaid)", values: w.map((x) => x.rcfMovement), total: total(w.map((x) => x.rcfMovement)) },
    { kind: "values", label: "Closing cash", values: w.map((x) => x.closingCash), total: r.summary.endingCash, style: "bold", flag: (v) => v < s.minimumCash - 0.5 },
    { kind: "spacer" },
    { kind: "section", label: "Facility and covenant" },
    { kind: "values", label: "Facility balance", values: w.map((x) => x.rcfBalance), style: "muted" },
    { kind: "values", label: "Undrawn facility", values: w.map((x) => x.undrawn), style: "muted" },
    { kind: "values", label: "Liquidity (cash + undrawn)", values: w.map((x) => x.liquidity) },
    { kind: "values", label: "Covenant minimum", values: w.map(() => s.covenantMinLiquidity), style: "muted" },
    { kind: "values", label: "Headroom / (breach)", values: w.map((x) => x.headroom), style: "bold", flag: (v) => v < -0.5 }
  ];

  const cell = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";
  return (
    <section className="bg-white border border-zinc-200 rounded-2xl">
      <div className="p-5 md:p-6 pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-900">13-week cash flow: {SCENARIO_LABEL[selected].toLowerCase()}</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {currencyCode()} thousands. Payments in brackets. Weeks start on the date shown. Cells in red are below minimum cash or breach the covenant.
          </p>
        </div>
        <div className="inline-flex bg-zinc-100 p-1 rounded-lg text-sm print:hidden">
          {[
            [false, "Line items"],
            [true, "By category"]
          ].map(([g, label]) => (
            <button key={String(g)} onClick={() => setGrouped(g as boolean)} className={`px-3 py-1 rounded-md ${grouped === g ? "bg-white shadow-sm text-zinc-900 font-medium" : "text-zinc-600"}`}>
              {label as string}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-sm print:text-[8px]">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <th className="sticky left-0 bg-zinc-50 text-left font-medium px-5 md:px-6 py-2 min-w-56 print:min-w-0">Week</th>
              {w.map((x) => (
                <th key={x.week} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  <span className="block text-zinc-900">{x.week}</span>
                  {x.label}
                </th>
              ))}
              <th className="px-3 pr-6 py-2 text-right font-medium text-zinc-900">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row.kind === "spacer") return <tr key={i} className="h-3" />;
              if (row.kind === "section")
                return (
                  <tr key={i}>
                    <td colSpan={WEEKS + 2} className="sticky left-0 bg-white px-5 md:px-6 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                      {row.label}
                    </td>
                  </tr>
                );
              const bold = row.style === "bold";
              return (
                <tr key={i} className={`${bold ? "border-t border-zinc-200 font-semibold text-zinc-900" : row.style === "muted" ? "text-zinc-500" : "text-zinc-700"} hover:bg-zinc-50`}>
                  <td className={`sticky left-0 bg-white px-5 md:px-6 py-1.5 ${row.style === "sub" ? "pl-8 md:pl-9" : ""}`}>{row.label}</td>
                  {row.values.map((v, j) => (
                    <td key={j} className={`${cell} ${row.flag?.(v) ? "text-red-700 bg-red-50 font-semibold" : ""}`}>
                      {thousands(v)}
                    </td>
                  ))}
                  <td className={`${cell} pr-6 ${bold ? "" : "text-zinc-900"}`}>{row.total === undefined || row.total === null ? "" : thousands(row.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ComparisonTable() {
  const { results, forecast } = useModel();
  const s = forecast.settings;
  const rows: [string, (k: "best" | "base" | "worst") => React.ReactNode][] = [
    ["Closing cash, week 13", (k) => thousands(results[k].summary.endingCash)],
    ["Lowest closing cash", (k) => `${thousands(results[k].summary.lowestCash)} (wk ${results[k].summary.lowestWeek})`],
    ["Net operating cash flow", (k) => thousands(results[k].summary.netOperating)],
    ["Peak facility drawn", (k) => `${thousands(results[k].summary.peakRcf)} of ${thousands(s.rcfLimit)}`],
    ["Lowest covenant headroom", (k) => `${thousands(results[k].summary.minHeadroom)} (wk ${results[k].summary.minHeadroomWeek})`],
    [
      "Covenant",
      (k) =>
        results[k].summary.breachWeeks.length ? (
          <span className="text-red-700 font-medium">✕ Breach from wk {results[k].summary.breachWeeks[0]} ({results[k].summary.breachWeeks.length} wks)</span>
        ) : (
          <span className="text-emerald-700 font-medium">✓ Met</span>
        )
    ],
    ["Cash shortfall below minimum", (k) => (results[k].summary.totalShortfall > 0.5 ? <span className="text-red-700 font-medium">{thousands(results[k].summary.totalShortfall)}</span> : "None")]
  ];
  return (
    <section className="bg-white border border-zinc-200 rounded-2xl break-inside-avoid min-w-0">
      <div className="p-5 md:p-6 pb-4">
        <h2 className="font-semibold text-zinc-900">Scenario comparison</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{currencyCode()} thousands</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <th className="text-left font-medium px-5 md:px-6 py-2">Measure</th>
              {(["best", "base", "worst"] as const).map((k) => (
                <th key={k} className="text-right font-medium px-3 py-2 last:pr-6">{SCENARIO_LABEL[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(([label, f]) => (
              <tr key={label}>
                <td className="px-5 md:px-6 py-2.5 text-zinc-700">{label}</td>
                {(["best", "base", "worst"] as const).map((k) => (
                  <td key={k} className="px-3 py-2.5 text-right tabular-nums text-zinc-900 last:pr-6 whitespace-nowrap">{f(k)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
