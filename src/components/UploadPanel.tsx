import { Download, FileSpreadsheet, FileText, Lock, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { downloadText } from "../lib/csv";
import { downloadTemplateWorkbook, readWorkbook } from "../lib/excel";
import { detectKind, importForecast, readSettings, TEMPLATE_FORECAST, TEMPLATE_SETTINGS, type FileKind, type UploadedFile } from "../lib/importer";
import type { Forecast, Settings } from "../lib/model";

const KIND_LABEL: Record<FileKind, string> = { forecast: "Forecast", settings: "Settings", unknown: "Not recognised" };

type Field = { key: keyof Settings; label: string; type: "text" | "date" | "number"; hint?: string };
const FIELDS: Field[] = [
  { key: "currency", label: "Currency code", type: "text" },
  { key: "startDate", label: "Week 1 starts", type: "date", hint: "Blank: this week's Monday" },
  { key: "openingCash", label: "Opening cash", type: "number" },
  { key: "minimumCash", label: "Minimum cash", type: "number", hint: "Facility is drawn to stay above this" },
  { key: "rcfLimit", label: "Credit facility limit", type: "number" },
  { key: "rcfDrawn", label: "Facility drawn at start", type: "number" },
  { key: "rcfRatePct", label: "Facility interest rate %", type: "number" },
  { key: "covenantMinLiquidity", label: "Covenant: minimum liquidity", type: "number", hint: "Cash + undrawn facility" }
];

const input = "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300";

export function UploadPanel({ onClose, onLoad }: { onClose: () => void; onLoad: (f: Forecast, notes: string[]) => void }) {
  const [files, setFiles] = useState<(UploadedFile & { kind: FileKind })[]>([]);
  const [values, setValues] = useState<Record<string, string>>({ currency: "USD" });
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const problems: string[] = [];
    const uploaded: UploadedFile[] = [];
    for (const f of [...list]) {
      if (/\.xlsx$/i.test(f.name)) {
        try {
          uploaded.push(...(await readWorkbook(f)));
        } catch {
          problems.push(`${f.name}: couldn't read this workbook. Try saving it again as .xlsx, or as CSV.`);
        }
      } else if (/\.xls$/i.test(f.name)) problems.push(`${f.name}: old .xls format isn't supported. Save it as .xlsx or CSV.`);
      else uploaded.push({ name: f.name, text: await f.text() });
    }
    const read = uploaded.map((u) => ({ ...u, kind: detectKind(u.text) }));
    // Fill the settings form from an uploaded settings sheet
    const settingsFile = read.find((r) => r.kind === "settings");
    if (settingsFile) {
      const s = readSettings(settingsFile.text);
      setValues((v) => ({ ...v, ...Object.fromEntries(Object.entries(s).filter(([k]) => k !== "company").map(([k, x]) => [k, String(x)])) }));
    }
    setErrors(problems);
    setFiles((prev) => [...prev.filter((p) => !read.some((r) => r.name === p.name)), ...read]);
  }

  function build() {
    const overrides: Partial<Settings> = {};
    for (const f of FIELDS) {
      const v = values[f.key]?.trim();
      if (!v) continue;
      (overrides as Record<string, unknown>)[f.key] = f.type === "number" ? Number(v.replace(/,/g, "")) : f.key === "currency" ? v.toUpperCase() : v;
    }
    const result = importForecast(files.filter((f) => f.kind !== "unknown"), overrides);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onLoad(result.forecast, result.notes);
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-sm flex items-start md:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div>
            <h2 id="upload-title" className="text-lg font-semibold text-zinc-900">Use your own forecast</h2>
            <p className="text-sm text-zinc-500 mt-1">Upload your 13-week receipts and payments to run the scenarios, facility and covenant tests on your numbers.</p>
          </div>
          <button onClick={onClose} className="p-1.5 -m-1.5 text-zinc-400 hover:text-zinc-900" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="flex gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
            Your files never leave your computer. Everything is calculated inside your browser, and nothing is uploaded or stored.
          </p>

          <div className="rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-medium text-zinc-900">Start from the template</p>
            <p className="text-sm text-zinc-500 mt-0.5">It contains the full sample forecast. Overwrite it with your numbers, then upload it below.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => downloadTemplateWorkbook()} className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-700 text-white rounded-full px-4 py-2 hover:bg-emerald-800">
                <FileSpreadsheet className="w-4 h-4" /> Excel template (.xlsx)
              </button>
              <button onClick={() => downloadText("forecast-template.csv", TEMPLATE_FORECAST)} className="inline-flex items-center gap-1.5 text-sm border border-zinc-200 rounded-full px-3 py-2 text-zinc-700 hover:border-zinc-400">
                <Download className="w-3.5 h-3.5" /> Forecast CSV
              </button>
              <button onClick={() => downloadText("settings-template.csv", TEMPLATE_SETTINGS)} className="inline-flex items-center gap-1.5 text-sm border border-zinc-200 rounded-full px-3 py-2 text-zinc-700 hover:border-zinc-400">
                <Download className="w-3.5 h-3.5" /> Settings CSV
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-900 mb-2">1. Choose your files</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`w-full border-2 border-dashed rounded-xl px-6 py-7 text-center transition-colors ${dragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-300 hover:border-zinc-400"}`}
            >
              <Upload className="w-6 h-6 mx-auto text-zinc-400" />
              <p className="text-sm text-zinc-700 mt-2">
                <span className="font-medium text-zinc-900">Click to choose</span> or drag files here
              </p>
              <p className="text-xs text-zinc-500 mt-1">The Excel template, or a forecast CSV (plus an optional settings CSV)</p>
            </button>
            <input ref={fileInput} type="file" accept=".csv,.txt,.xlsx,.xls" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && (
              <ul className="mt-3 divide-y divide-zinc-100 border border-zinc-200 rounded-xl">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="flex-1 truncate text-zinc-900">{f.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.kind === "unknown" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-700"}`}>{KIND_LABEL[f.kind]}</span>
                    <button onClick={() => setFiles(files.filter((x) => x.name !== f.name))} className="text-zinc-400 hover:text-zinc-900" aria-label={`Remove ${f.name}`}>
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-900">2. Check the settings</p>
            <p className="text-xs text-zinc-500 mb-3">Filled in from your settings sheet, if you uploaded one. Amounts in full units.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="text-xs text-zinc-500">
                  {f.label}
                  <input
                    type={f.type === "date" ? "date" : "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className={`${input} mt-1`}
                  />
                  {f.hint && <span className="block mt-1">{f.hint}</span>}
                </label>
              ))}
            </div>
          </div>

          {errors.length > 0 && (
            <ul className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1 list-disc list-inside">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-200 bg-zinc-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-full text-zinc-700 hover:bg-zinc-200/60">Cancel</button>
          <button
            onClick={build}
            disabled={!files.some((f) => f.kind === "forecast")}
            className="text-sm font-medium px-5 py-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-300 disabled:cursor-not-allowed"
          >
            Run forecast
          </button>
        </div>
      </div>
    </div>
  );
}
