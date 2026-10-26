import { RotateCcw } from "lucide-react";
import { DEFAULT_DRIVERS, DRIVER_SPECS, SCENARIO_LABEL, SCENARIOS, type Drivers, type ScenarioKey } from "../lib/model";
import { SCENARIO_COLOR } from "../lib/colors";

type Props = {
  drivers: Record<ScenarioKey, Drivers>;
  selected: ScenarioKey;
  onSelect: (k: ScenarioKey) => void;
  onChange: (k: ScenarioKey, d: Drivers) => void;
};

const fmt = (v: number, unit: string) => `${v > 0 && unit !== " wks" ? "+" : ""}${v}${unit}`;

export function ScenarioPanel({ drivers, selected, onSelect, onChange }: Props) {
  const d = drivers[selected];
  const changed = DRIVER_SPECS.some((s) => d[s.key] !== DEFAULT_DRIVERS[selected][s.key]);

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-zinc-900">Scenarios</h2>
        {changed && (
          <button onClick={() => onChange(selected, DEFAULT_DRIVERS[selected])} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>
      <p className="text-sm text-zinc-500 mt-0.5">Pick a scenario and adjust its assumptions. All three stay on the charts.</p>

      <div className="grid grid-cols-3 gap-1 bg-zinc-100 p-1 rounded-xl mt-4" role="tablist">
        {SCENARIOS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={selected === k}
            onClick={() => onSelect(k)}
            className={`flex items-center justify-center gap-2 text-sm py-2 rounded-lg transition-colors ${selected === k ? "bg-white shadow-sm text-zinc-900 font-medium" : "text-zinc-600 hover:text-zinc-900"}`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: SCENARIO_COLOR[k] }} />
            {SCENARIO_LABEL[k].replace(" case", "")}
          </button>
        ))}
      </div>

      <div className="space-y-5 mt-6">
        {DRIVER_SPECS.map((s) => {
          const v = d[s.key];
          return (
            <label key={s.key} className="block">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-zinc-900">{s.label}</span>
                <span className={`font-mono text-sm tabular-nums ${v === 0 ? "text-zinc-400" : "text-zinc-900"}`}>{fmt(v, s.unit)}</span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={v}
                onChange={(e) => onChange(selected, { ...d, [s.key]: Number(e.target.value) })}
                className="w-full mt-2 accent-zinc-900"
                aria-label={s.label}
              />
              <span className="block text-xs text-zinc-500">{s.help}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
