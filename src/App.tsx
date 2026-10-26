import { ArrowLeft, ChevronDown, Download, FileSpreadsheet, Github, Printer, RotateCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BridgeChart, CashChart, LiquidityChart } from "./components/Charts";
import { ComparisonTable, ForecastTable } from "./components/ForecastTable";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { UploadPanel } from "./components/UploadPanel";
import { SCENARIO_COLOR } from "./lib/colors";
import { downloadReportWorkbook, downloadScenarioCsv } from "./lib/excel";
import { date, money, moneyShort, setCurrency } from "./lib/format";
import { sampleForecast } from "./lib/importer";
import {
  DEFAULT_DRIVERS,
  DRIVER_SPECS,
  ModelContext,
  REPAY_ABOVE_MULTIPLE,
  runScenario,
  SCENARIO_LABEL,
  SCENARIOS,
  WEEKS,
  type Drivers,
  type Forecast,
  type Model,
  type ScenarioKey
} from "./lib/model";

const REPO = "https://github.com/amila-nandasiri/cash-flow-forecast";
const SITE = "https://dewapriya.com";
const OFFLINE_FILE = "cash-flow-forecast.html";
const isOffline = typeof location !== "undefined" && location.protocol === "file:";

type Kpi = { label: string; value: string; note: string; tone?: "good" | "bad" };

function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-4 md:p-5 break-inside-avoid">
      <p className="text-sm text-zinc-500">{kpi.label}</p>
      <p className={`text-2xl md:text-3xl font-semibold tracking-tight mt-1 tabular-nums ${kpi.tone === "bad" ? "text-red-700" : kpi.tone === "good" ? "text-emerald-700" : "text-zinc-900"}`}>{kpi.value}</p>
      <p className="text-xs text-zinc-500 mt-2">{kpi.note}</p>
    </div>
  );
}

function ReportMenu({ model }: { model: Model }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const item = "w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-lg hover:bg-zinc-100";
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 text-sm border border-zinc-200 rounded-full px-4 py-2 text-zinc-700 hover:border-zinc-400 transition-colors bg-white">
        <Download className="w-4 h-4" /> Download report <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-zinc-200 rounded-xl shadow-xl p-1.5 z-40 text-sm">
          <button className={item} onClick={pick(() => downloadReportWorkbook(model))}>
            <FileSpreadsheet className="w-4 h-4 mt-0.5 text-emerald-700" />
            <span><span className="block font-medium text-zinc-900">Excel report</span><span className="text-xs text-zinc-500">Summary plus a 13-week sheet for each scenario</span></span>
          </button>
          <button className={item} onClick={pick(() => window.print())}>
            <Printer className="w-4 h-4 mt-0.5 text-zinc-500" />
            <span><span className="block font-medium text-zinc-900">PDF report</span><span className="text-xs text-zinc-500">Print or "Save as PDF" the selected scenario</span></span>
          </button>
          <div className="border-t border-zinc-100 my-1" />
          <button className={item} onClick={pick(() => downloadScenarioCsv(model))}>
            <Download className="w-4 h-4 mt-0.5 text-zinc-500" />
            <span className="font-medium text-zinc-900">{SCENARIO_LABEL[model.selected]} (CSV)</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const sample = useMemo(() => sampleForecast(), []);
  const [forecast, setForecast] = useState<Forecast>(sample);
  const [notes, setNotes] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<Record<ScenarioKey, Drivers>>(DEFAULT_DRIVERS);
  const [selected, setSelected] = useState<ScenarioKey>("base");
  const [showUpload, setShowUpload] = useState(false);

  const model: Model = useMemo(() => {
    setCurrency(forecast.settings.currency);
    const results = Object.fromEntries(SCENARIOS.map((k) => [k, runScenario(forecast, k, drivers[k])])) as Model["results"];
    return { forecast, drivers, results, selected };
  }, [forecast, drivers, selected]);

  const s = forecast.settings;
  const r = model.results[selected].summary;
  const weeks = model.results[selected].weeks;
  const isSample = forecast.source === "sample";
  const weekLabel = (n: number) => `week ${n} (${weeks[n - 1].label})`;

  const kpis: Kpi[] = [
    { label: "Closing cash, week 13", value: moneyShort(r.endingCash), note: `Opening ${moneyShort(s.openingCash)} · ${r.endingCash >= s.openingCash ? "up" : "down"} ${moneyShort(Math.abs(r.endingCash - s.openingCash))}` },
    { label: "Lowest closing cash", value: moneyShort(r.lowestCash), note: `In ${weekLabel(r.lowestWeek)}`, tone: r.lowestCash < s.minimumCash - 0.5 ? "bad" : undefined },
    { label: "Net operating cash flow", value: moneyShort(r.netOperating), note: "Receipts less payments, 13 weeks", tone: r.netOperating < 0 ? "bad" : undefined },
    { label: "Peak facility drawn", value: moneyShort(r.peakRcf), note: s.rcfLimit ? `${Math.round((r.peakRcf / s.rcfLimit) * 100)}% of the ${moneyShort(s.rcfLimit)} facility` : "No facility" },
    r.breachWeeks.length
      ? { label: "Liquidity covenant", value: "Breach", note: `From ${weekLabel(r.breachWeeks[0])} · ${r.breachWeeks.length} of ${WEEKS} weeks`, tone: "bad" }
      : { label: "Liquidity covenant", value: "Met", note: `Lowest headroom ${moneyShort(r.minHeadroom)} in week ${r.minHeadroomWeek}`, tone: "good" },
    r.totalShortfall > 0.5
      ? { label: "Funding gap", value: moneyShort(r.totalShortfall), note: "Cash below minimum even with the facility fully drawn", tone: "bad" }
      : { label: "Funding gap", value: "None", note: "Minimum cash held every week", tone: "good" }
  ];

  return (
    <ModelContext.Provider value={model}>
      <div className="min-h-screen">
        <header className="border-b border-zinc-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-zinc-500">
                Treasury · {s.company} · weeks from {date(s.startDate)}
              </p>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 mt-1">13-Week Cash Flow Forecast</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 text-sm font-medium bg-emerald-700 text-white rounded-full px-4 py-2 hover:bg-emerald-800 transition-colors">
                <Upload className="w-4 h-4" /> Use your data
              </button>
              <ReportMenu model={model} />
              {!isOffline && (
                <>
                  <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm border border-zinc-200 rounded-full px-4 py-2 text-zinc-700 hover:border-zinc-400 transition-colors" title="Source code">
                    <Github className="w-4 h-4" /> <span className="hidden sm:inline">Code</span>
                  </a>
                  <a href={SITE} className="inline-flex items-center gap-1.5 text-sm bg-zinc-900 text-white rounded-full px-4 py-2 hover:bg-zinc-700 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Portfolio
                  </a>
                </>
              )}
            </div>
          </div>
        </header>

        {isSample ? (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm print:hidden">
            <p className="max-w-7xl mx-auto px-4 md:px-6 py-2.5">
              <strong className="font-medium">Fictional sample:</strong> a Maldives seaplane operator heading from the low season into the December peak, with a{" "}
              {moneyShort(s.rcfLimit)} credit facility and a {moneyShort(s.covenantMinLiquidity)} liquidity covenant.{" "}
              <button onClick={() => setShowUpload(true)} className="underline underline-offset-2 font-medium hover:text-amber-950">
                Use your own forecast
              </button>
              . Files stay on your computer.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-sm print:hidden">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p>
                  Showing <strong className="font-medium">your forecast</strong> ({forecast.label}). Processed only in this browser, so nothing was uploaded.
                </p>
                {notes.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-emerald-800">Import notes ({notes.length})</summary>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-emerald-900/90">
                      {notes.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </details>
                )}
              </div>
              <button
                onClick={() => {
                  setForecast(sample);
                  setNotes([]);
                }}
                className="inline-flex items-center gap-1.5 text-emerald-900 font-medium hover:underline"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Back to sample data
              </button>
            </div>
          </div>
        )}

        <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
          <div className="hidden print:block text-sm text-zinc-700">
            <p>
              <strong>{SCENARIO_LABEL[selected]}</strong> ·{" "}
              {DRIVER_SPECS.map((d) => `${d.label} ${drivers[selected][d.key]}${d.unit}`).join(" · ")}
            </p>
            <p className="text-zinc-500">
              {s.company} · {s.currency} · week 1 from {date(s.startDate)} · generated {date(new Date().toISOString().slice(0, 10))}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: SCENARIO_COLOR[selected] }} />
            Figures below are for the <strong className="font-medium text-zinc-900">{SCENARIO_LABEL[selected].toLowerCase()}</strong>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 print:grid-cols-6 gap-3 md:gap-4">
            {kpis.map((k) => <KpiTile key={k.label} kpi={k} />)}
          </div>

          <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
            <div className="lg:sticky lg:top-4">
              <ScenarioPanel drivers={drivers} selected={selected} onSelect={setSelected} onChange={(k, d) => setDrivers({ ...drivers, [k]: d })} />
            </div>
            <div className="space-y-6 min-w-0">
              <CashChart />
              <LiquidityChart />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-start">
            <BridgeChart />
            <ComparisonTable />
          </div>

          <ForecastTable />

          <section className="grid md:grid-cols-3 gap-6 text-sm text-zinc-600 pt-4 break-inside-avoid">
            <div>
              <h3 className="font-medium text-zinc-900 mb-1">Credit facility</h3>
              <p>
                Each week the facility is drawn to keep cash at the minimum ({money(s.minimumCash)}), up to its limit, and repaid from cash above{" "}
                {REPAY_ABOVE_MULTIPLE}× the minimum. Interest of {s.rcfRatePct}% a year is paid weekly on the balance drawn.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-900 mb-1">Liquidity covenant</h3>
              <p>
                Liquidity is closing cash plus the undrawn facility. It must stay above {money(s.covenantMinLiquidity)}; any week below is a breach. The funding gap is cash
                below minimum once the facility is fully drawn.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-900 mb-1">Scenario drivers</h3>
              <p>
                Sliders flex the base forecast by category. A collection delay spreads each week's receipts over the following weeks with that average delay; anything pushed beyond week 13 drops out of the window.
                Fuel moves with both fuel price and 70% of the change in activity.
              </p>
            </div>
          </section>

          {!isOffline && (
            <section className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
              <div>
                <h2 className="font-semibold text-zinc-900">Use it offline</h2>
                <p className="text-sm text-zinc-500 mt-0.5 max-w-2xl">
                  Download the whole model as a single HTML file. Open it in any browser, with or without internet, and load your forecast. Nothing is sent anywhere.
                </p>
              </div>
              <a href={OFFLINE_FILE} download className="inline-flex items-center gap-2 text-sm font-medium bg-zinc-900 text-white rounded-full px-5 py-2.5 hover:bg-zinc-700 transition-colors">
                <Download className="w-4 h-4" /> Download HTML file
              </a>
            </section>
          )}
        </main>

        <footer className="border-t border-zinc-200 mt-8">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
            <p>
              Built by <a href={SITE} className="text-zinc-900 hover:underline">Amila Dewapriya</a>, CMA
            </p>
            <p className="font-mono">React · TypeScript · Recharts</p>
          </div>
        </footer>
      </div>

      {showUpload && (
        <UploadPanel
          onClose={() => setShowUpload(false)}
          onLoad={(f, n) => {
            setForecast(f);
            setNotes(n);
            setShowUpload(false);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </ModelContext.Provider>
  );
}
