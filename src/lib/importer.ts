// Reads a forecast from uploaded files (or the bundled sample): a settings file of
// key/value pairs and a forecast grid of line items by week.

import forecastCsv from "../../data/forecast.csv?raw";
import settingsCsv from "../../data/settings.csv?raw";
import { parseCsv } from "./csv";
import { PAYMENT_CATEGORIES, RECEIPT_CATEGORIES, WEEKS, type Category, type Forecast, type Line, type Settings } from "./model";

export type UploadedFile = { name: string; text: string };
export type FileKind = "forecast" | "settings" | "unknown";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseNumber(raw: string | undefined): number | null {
  let v = (raw ?? "").trim();
  if (!v || v === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.endsWith("-")) {
    negative = true;
    v = v.slice(0, -1);
  }
  v = v.replace(/[^0-9.\-]/g, "");
  if (!v || v === "-" || v === ".") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** ISO, day-first numeric (30/09/2026), "5-Oct-2026", or an Excel serial date */
export function parseDate(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  const iso = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
  };
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return +m[2] > 12 ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
  m = v.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{2,4})$/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  if (/^\d{5}$/.test(v) && +v > 20000 && +v < 80000) return new Date(Date.UTC(1899, 11, 30) + +v * 86_400_000).toISOString().slice(0, 10);
  return null;
}

// ---------------------------------------------------------------------------
// Detecting the file type and week columns
// ---------------------------------------------------------------------------

function weekColumns(headers: string[]): { index: number; date: string | null }[] {
  const byNumber = headers
    .map((h, index) => ({ index, m: h.trim().match(/^(?:w|wk|week)[\s_.-]*(\d{1,2})$/i) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
    .map((x) => ({ index: x.index, date: null }));
  if (byNumber.length) return byNumber;
  return headers
    .map((h, index) => ({ index, date: parseDate(h) }))
    .filter((x) => x.date)
    .sort((a, b) => a.date!.localeCompare(b.date!));
}

export function detectKind(text: string): FileKind {
  const [headers = []] = parseCsv(text);
  const h = headers.map(norm);
  if (weekColumns(headers).length >= 2) return "forecast";
  if (h.includes("setting") || h.includes("key") || (h.includes("value") && headers.length <= 3)) return "settings";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Categories: matched from the category column, else the line item name
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = [...RECEIPT_CATEGORIES, ...PAYMENT_CATEGORIES] as Category[];

export function categorise(text: string, type: "receipt" | "payment"): Category {
  const exact = ALL_CATEGORIES.find((c) => norm(c) === norm(text));
  if (exact) return exact;
  const t = text.toLowerCase();
  if (type === "receipt") {
    if (/(existing|opening|current|aged|overdue).*(receivable|debtor|ar\b)|receivable|debtor/.test(t)) return "Collections – existing receivables";
    if (/collect|sales|customer|revenue|billing|invoice/.test(t)) return "Collections – new sales";
    return "Other receipts";
  }
  if (/payroll|salar|wage|staff|employee|pension|epf|etf/.test(t)) return "Payroll";
  if (/fuel|diesel|petrol/.test(t)) return "Fuel";
  if (/maint|repair|spare|overhaul check|c-check/.test(t)) return "Maintenance";
  if (/lease|rent/.test(t)) return "Leases & rent";
  if (/tax|gst|vat|mira|withholding|duty/.test(t)) return "Taxes";
  if (/loan|debt|interest|instal|borrow|repay/.test(t)) return "Debt service";
  if (/capex|capital|equipment|asset|overhaul|purchase of|vehicle|aircraft/.test(t)) return "Capex";
  if (/supplier|operating|opex|utilit|insurance|handling|catering|marketing|it\b|software|admin/.test(t)) return "Suppliers & operating costs";
  return "Other payments";
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const SETTING_KEYS: Record<keyof Settings, string[]> = {
  company: ["company", "companyname", "entity", "name"],
  currency: ["currency", "currencycode"],
  startDate: ["startdate", "weekstarting", "week1start", "forecaststart", "start"],
  openingCash: ["openingcash", "openingbalance", "cash", "startingcash", "openingcashbalance"],
  minimumCash: ["minimumcash", "mincash", "cashbuffer", "minimumbalance"],
  rcfLimit: ["rcflimit", "facilitylimit", "creditlimit", "overdraftlimit", "revolverlimit"],
  rcfDrawn: ["rcfdrawn", "facilitydrawn", "drawn", "overdraftdrawn", "revolverdrawn", "openingrcf"],
  rcfRatePct: ["rcfratepct", "rcfrate", "interestrate", "facilityrate", "rate"],
  covenantMinLiquidity: ["covenantminliquidity", "minimumliquidity", "liquiditycovenant", "covenant"]
};

export const DEFAULT_SETTINGS: Settings = {
  company: "",
  currency: "USD",
  startDate: "",
  openingCash: 0,
  minimumCash: 0,
  rcfLimit: 0,
  rcfDrawn: 0,
  rcfRatePct: 0,
  covenantMinLiquidity: 0
};

export function readSettings(text: string): Partial<Settings> {
  const out: Partial<Settings> = {};
  const rows = parseCsv(text);
  const first = rows[0]?.map(norm) ?? [];
  const body = first.includes("setting") || first.includes("key") || first.includes("value") ? rows.slice(1) : rows;
  for (const [k = "", v = ""] of body) {
    const key = (Object.keys(SETTING_KEYS) as (keyof Settings)[]).find((f) => SETTING_KEYS[f].includes(norm(k)));
    if (!key) continue;
    if (key === "company" || key === "currency") out[key] = v.trim() as never;
    else if (key === "startDate") out.startDate = parseDate(v) ?? undefined;
    else {
      const n = parseNumber(v);
      if (n !== null) out[key] = n as never;
    }
  }
  return out;
}

/** Monday on or before a date */
function mondayOf(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

export type ImportResult = { ok: true; forecast: Forecast; notes: string[] } | { ok: false; errors: string[]; notes: string[] };

export function importForecast(files: UploadedFile[], overrides: Partial<Settings>): ImportResult {
  const notes: string[] = [];
  const errors: string[] = [];
  const forecastFiles = files.filter((f) => detectKind(f.text) === "forecast");
  const settingsFiles = files.filter((f) => detectKind(f.text) === "settings");
  if (forecastFiles.length !== 1) {
    errors.push(forecastFiles.length ? "Upload one forecast sheet at a time." : "A forecast is required: one row per line item, with columns for each week (Week 1 … Week 13, or week-commencing dates).");
    return { ok: false, errors, notes };
  }

  const fromFile = settingsFiles.length ? readSettings(settingsFiles[0].text) : {};
  const file = forecastFiles[0];
  const [headers, ...rows] = parseCsv(file.text);
  const hn = headers.map(norm);
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = hn.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const nameCol = col("lineitem", "item", "description", "name", "line", "account");
  const typeCol = col("type", "flow", "direction", "receiptpayment", "inout");
  const catCol = col("category", "group", "section");
  const weeks = weekColumns(headers);

  if (weeks.length > WEEKS) notes.push(`${weeks.length} week columns found; the first ${WEEKS} are used.`);
  if (weeks.length < WEEKS) notes.push(`Only ${weeks.length} week columns found; later weeks are treated as zero.`);
  const used = weeks.slice(0, WEEKS);

  const lines: Line[] = [];
  let skipped = 0;
  for (const r of rows) {
    const name = (nameCol >= 0 ? r[nameCol] : r[0])?.trim() ?? "";
    if (!name || /^(total|net|opening|closing)\b/i.test(name)) {
      if (name) skipped++;
      continue;
    }
    const raw = used.map((w) => parseNumber(r[w.index]) ?? 0);
    while (raw.length < WEEKS) raw.push(0);
    const typeText = typeCol >= 0 ? (r[typeCol] ?? "").toLowerCase() : "";
    const catText = catCol >= 0 ? (r[catCol] ?? "") : "";
    let type: "receipt" | "payment";
    if (/^(r|in|receipt|inflow|income|\+)/.test(typeText)) type = "receipt";
    else if (/^(p|out|payment|outflow|expense|-)/.test(typeText)) type = "payment";
    else if ((RECEIPT_CATEGORIES as readonly string[]).includes(catText)) type = "receipt";
    else if ((PAYMENT_CATEGORIES as readonly string[]).includes(catText)) type = "payment";
    else type = raw.some((v) => v < 0) ? "payment" : /receipt|collection|income|sales|refund|claim/i.test(name) ? "receipt" : "payment";
    lines.push({ name, type, category: categorise(catText || name, type), weeks: raw.map(Math.abs) });
  }
  if (skipped) notes.push(`${skipped} total or balance rows skipped; totals and balances are calculated by the model.`);
  if (!lines.length) {
    errors.push(`No line items found in "${file.name}".`);
    return { ok: false, errors, notes };
  }

  const settings: Settings = { ...DEFAULT_SETTINGS, ...fromFile };
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined && v !== "") (settings as Record<string, unknown>)[k] = v;
  if (!settings.startDate) settings.startDate = used[0]?.date ?? mondayOf(new Date().toISOString().slice(0, 10));
  if (!settings.company) settings.company = file.name.replace(/\.(csv|xlsx).*$/i, "");

  const receipts = lines.filter((l) => l.type === "receipt").length;
  notes.unshift(`${lines.length} line items read (${receipts} receipts, ${lines.length - receipts} payments) from "${file.name}".`);
  if (!lines.some((l) => l.category === "Collections – existing receivables"))
    notes.push("No line was recognised as collections from existing receivables, so the bad-debt slider has no effect.");
  if (!settings.rcfLimit) notes.push("No credit facility limit was given, so the model shows cash without facility support.");

  return { ok: true, notes, forecast: { source: "upload", label: files.map((f) => f.name).join(", "), settings, lines } };
}

export function sampleForecast(): Forecast {
  const r = importForecast(
    [
      { name: "settings.csv", text: settingsCsv },
      { name: "forecast.csv", text: forecastCsv }
    ],
    {}
  );
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return { ...r.forecast, source: "sample", label: "Sample data: Maldives seaplane operator (fictional)" };
}

export const TEMPLATE_SETTINGS = settingsCsv;
export const TEMPLATE_FORECAST = forecastCsv;
