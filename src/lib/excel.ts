// Excel support: read uploaded workbooks, and write the template and the report.

import readXlsxFile from "read-excel-file/browser";
import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/browser";
import { downloadText, parseCsv, toCsv } from "./csv";
import { TEMPLATE_FORECAST, TEMPLATE_SETTINGS, type UploadedFile } from "./importer";
import { DRIVER_SPECS, SCENARIO_LABEL, SCENARIOS, WEEKS, type Model, type ScenarioResult } from "./model";

const isoDate = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/** Each sheet with data rows becomes one "file" */
export async function readWorkbook(file: File): Promise<UploadedFile[]> {
  const sheets = await readXlsxFile(file);
  return sheets
    .filter((s) => !/^(instructions|read ?me|notes?)$/i.test(s.sheet.trim()) && s.data.length > 1)
    .map((s) => ({
      name: sheets.length > 1 ? `${file.name} · ${s.sheet}` : file.name,
      text: toCsv(s.data.map((row) => row.map((v) => (v instanceof Date ? isoDate(v) : v === null ? "" : String(v)))))
    }));
}

const header = (v: string): Cell => ({ value: v, fontWeight: "bold", backgroundColor: "#F4F4F5", borderStyle: "thin", borderColor: "#D4D4D8" });
const num = (n: number, bold = false): Cell => ({ value: Math.round(n), type: Number, format: "#,##0;(#,##0);-", ...(bold ? { fontWeight: "bold" as const } : {}) });

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

const INSTRUCTIONS = [
  ["13-week cash flow forecast: template"],
  [""],
  ["1. Settings sheet: enter opening cash, minimum cash, your credit facility and the covenant. Amounts in full units, not thousands."],
  ["2. Forecast sheet: one row per receipt or payment line, with an amount for each of the 13 weeks. Enter payments as positive numbers."],
  ["3. type is 'receipt' or 'payment'. category drives the scenario sliders; use one of the categories below."],
  ["4. Save and upload this workbook on the dashboard with 'Use your data'. The example rows are a full sample forecast you can overwrite."],
  [""],
  ["Receipt categories", "Collections – existing receivables · Collections – new sales · Other receipts"],
  ["Payment categories", "Payroll · Fuel · Suppliers & operating costs · Maintenance · Leases & rent · Taxes · Debt service · Capex · Other payments"],
  [""],
  ["How the sliders use categories"],
  ["Sales volume", "Collections – new sales, and Fuel (70% of fuel moves with activity)"],
  ["Collection delay", "Both collection categories, spread over later weeks with that average delay"],
  ["Bad debt", "Collections – existing receivables"],
  ["Fuel price", "Fuel"],
  ["Cost savings", "Suppliers & operating costs, and Other payments"],
  ["Capex deferral", "Capex"],
  [""],
  ["Your data stays on your computer: the dashboard calculates everything in your browser."]
];

export async function downloadTemplateWorkbook() {
  const settings = parseCsv(TEMPLATE_SETTINGS);
  const forecast = parseCsv(TEMPLATE_FORECAST);
  await writeXlsxFile([
    {
      sheet: "Instructions",
      data: INSTRUCTIONS.map((r, i) => r.map((v): Cell => (i === 0 || (r.length === 1 && /categories|^How/.test(v)) ? { value: v, fontWeight: "bold" } : v))),
      columns: [{ width: 28 }, { width: 100 }]
    },
    {
      sheet: "Settings",
      data: [
        settings[0].map(header),
        ...settings.slice(1).map(([k, v, note]): Cell[] => [k, k === "start_date" ? { value: new Date(v + "T00:00:00Z"), type: Date, format: "yyyy-mm-dd" } : /^-?\d+(\.\d+)?$/.test(v) ? { value: Number(v), type: Number, format: k === "rcf_rate_pct" ? "0.0" : "#,##0" } : v, note])
      ],
      columns: [{ width: 26 }, { width: 22 }, { width: 70 }]
    },
    {
      sheet: "Forecast",
      data: [forecast[0].map(header), ...forecast.slice(1).map((r): Cell[] => r.map((v, i) => (i >= 3 ? { value: Number(v), type: Number, format: "#,##0" } : v)))],
      columns: [{ width: 42 }, { width: 10 }, { width: 32 }, ...Array.from({ length: WEEKS }, () => ({ width: 12 }))],
      stickyRowsCount: 1,
      stickyColumnsCount: 1
    }
  ]).toFile("cash-flow-template.xlsx");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function scenarioSheet(m: Model, r: ScenarioResult): SheetData {
  const s = m.forecast.settings;
  const w = r.weeks;
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const row = (label: string, values: number[], tot: number | null, bold = false): Cell[] => [
    bold ? { value: label, fontWeight: "bold" } : label,
    ...values.map((v) => num(v, bold)),
    tot === null ? null : num(tot, bold)
  ];
  const receipts = r.lines.filter((l) => l.type === "receipt");
  const payments = r.lines.filter((l) => l.type === "payment");
  return [
    [{ value: `13-week cash flow forecast: ${SCENARIO_LABEL[r.key]}`, fontWeight: "bold", fontSize: 13 }],
    [`${s.company} · ${s.currency} · payments shown as negatives`],
    [],
    [header("Week"), ...w.map((x) => header(String(x.week))), header("Total")],
    [header("Week commencing"), ...w.map((x) => ({ ...(header(x.start) as object), type: String }) as Cell), header("")],
    row("Opening cash", w.map((x) => x.openingCash), s.openingCash, true),
    [{ value: "Receipts", fontWeight: "bold" }],
    ...receipts.map((l) => row(`  ${l.name}`, l.weeks, total(l.weeks))),
    row("Total receipts", w.map((x) => x.receipts), r.summary.receipts, true),
    [{ value: "Payments", fontWeight: "bold" }],
    ...payments.map((l) => row(`  ${l.name}`, l.weeks.map((v) => -v), -total(l.weeks))),
    row("Total payments", w.map((x) => -x.payments), -r.summary.payments, true),
    [],
    row("Net operating cash flow", w.map((x) => x.operatingFlow), r.summary.netOperating, true),
    row("Facility interest", w.map((x) => -x.rcfInterest), -r.summary.totalInterest),
    row("Facility drawn / (repaid)", w.map((x) => x.rcfMovement), total(w.map((x) => x.rcfMovement))),
    row("Closing cash", w.map((x) => x.closingCash), r.summary.endingCash, true),
    [],
    row("Facility balance", w.map((x) => x.rcfBalance), null),
    row("Undrawn facility", w.map((x) => x.undrawn), null),
    row("Liquidity (cash + undrawn)", w.map((x) => x.liquidity), null),
    row("Covenant minimum", w.map(() => s.covenantMinLiquidity), null),
    row("Headroom / (breach)", w.map((x) => x.headroom), null, true)
  ];
}

export async function downloadReportWorkbook(m: Model) {
  const s = m.forecast.settings;
  const summary: SheetData = [
    [{ value: "13-week cash flow forecast", fontWeight: "bold", fontSize: 14 }],
    ["Company", s.company],
    ["Week 1 commencing", { value: new Date(s.startDate + "T00:00:00Z"), type: Date, format: "dd mmm yyyy" }],
    ["Currency", s.currency],
    [],
    [header("Settings"), header("Value")],
    ["Opening cash", num(s.openingCash)],
    ["Minimum cash", num(s.minimumCash)],
    ["Credit facility limit", num(s.rcfLimit)],
    ["Facility drawn at start", num(s.rcfDrawn)],
    ["Facility interest rate", { value: s.rcfRatePct / 100, type: Number, format: "0.0%" }],
    ["Covenant: minimum liquidity", num(s.covenantMinLiquidity)],
    [],
    [header("Scenario assumptions"), ...SCENARIOS.map((k) => header(SCENARIO_LABEL[k]))],
    ...DRIVER_SPECS.map((d): Cell[] => [d.label, ...SCENARIOS.map((k) => `${m.drivers[k][d.key]}${d.unit}`)]),
    [],
    [header("Results"), ...SCENARIOS.map((k) => header(SCENARIO_LABEL[k]))],
    ["Closing cash, week 13", ...SCENARIOS.map((k) => num(m.results[k].summary.endingCash))],
    ["Lowest closing cash", ...SCENARIOS.map((k) => num(m.results[k].summary.lowestCash))],
    ["Week of lowest cash", ...SCENARIOS.map((k) => m.results[k].summary.lowestWeek)],
    ["Net operating cash flow", ...SCENARIOS.map((k) => num(m.results[k].summary.netOperating))],
    ["Peak facility drawn", ...SCENARIOS.map((k) => num(m.results[k].summary.peakRcf))],
    ["Lowest covenant headroom", ...SCENARIOS.map((k) => num(m.results[k].summary.minHeadroom))],
    ["Covenant breach weeks", ...SCENARIOS.map((k) => m.results[k].summary.breachWeeks.join(", ") || "None")],
    ["Cash shortfall below minimum", ...SCENARIOS.map((k) => num(m.results[k].summary.totalShortfall))]
  ];
  const weekCols = [{ width: 40 }, ...Array.from({ length: WEEKS }, () => ({ width: 12 })), { width: 13 }];
  await writeXlsxFile([
    { sheet: "Summary", data: summary, columns: [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }] },
    ...SCENARIOS.map((k) => ({ sheet: SCENARIO_LABEL[k], data: scenarioSheet(m, m.results[k]), columns: weekCols, stickyColumnsCount: 1 }))
  ]).toFile(`cash-flow-forecast-${s.startDate}.xlsx`);
}

/** The selected scenario's 13-week grid as CSV */
export function downloadScenarioCsv(m: Model) {
  const sheet = scenarioSheet(m, m.results[m.selected]).slice(3);
  const plain = sheet.map((r) => r.map((c) => (c && typeof c === "object" && "value" in c ? (c.value instanceof Date ? isoDate(c.value) : String(c.value ?? "")) : c === null || c === undefined ? "" : String(c))));
  downloadText(`cash-flow-${m.selected}-case-${m.forecast.settings.startDate}.csv`, toCsv(plain));
}
