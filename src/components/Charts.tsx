import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from "recharts";
import { C, SCENARIO_COLOR } from "../lib/colors";
import { money, moneyShort } from "../lib/format";
import { SCENARIO_LABEL, SCENARIOS, useModel, type ScenarioKey, type WeekResult } from "../lib/model";

const axisProps = { stroke: C.axis, fontSize: 12, tickLine: false, axisLine: false } as const;

export function Card({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 break-inside-avoid min-w-0 ${className}`}>
      <h2 className="font-semibold text-zinc-900">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Legend({ selected }: { selected: ScenarioKey }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 mb-3">
      {SCENARIOS.map((k) => (
        <span key={k} className={`inline-flex items-center gap-1.5 ${k === selected ? "font-medium text-zinc-900" : ""}`}>
          <span className="w-3 h-0.5 rounded" style={{ background: SCENARIO_COLOR[k], height: k === selected ? 3 : 2 }} />
          {SCENARIO_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

function ScenarioTooltip({ active, payload, label, refLabel, refValue }: TooltipProps<number, string> & { refLabel: string; refValue: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-zinc-900 mb-1">Week commencing {label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-zinc-600">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          {SCENARIO_LABEL[p.dataKey as ScenarioKey]}: <span className="font-medium text-zinc-900 tabular-nums">{money(Number(p.value))}</span>
        </p>
      ))}
      <p className="text-zinc-500 mt-1">
        {refLabel}: {money(refValue)}
      </p>
    </div>
  );
}

/** One line per scenario, with a dashed reference line (minimum cash or covenant) */
function ScenarioLines({ value, refValue, refLabel }: { value: (w: WeekResult) => number; refValue: number; refLabel: string }) {
  const { results, selected } = useModel();
  const data = results.base.weeks.map((w, i) => ({
    label: w.label,
    best: value(results.best.weeks[i]),
    base: value(results.base.weeks[i]),
    worst: value(results.worst.weeks[i])
  }));
  const all = data.flatMap((d) => [d.best, d.base, d.worst, refValue]);
  const lo = Math.min(0, ...all);
  const hi = Math.max(...all);
  // Draw the selected scenario last so it sits on top
  const order = [...SCENARIOS.filter((k) => k !== selected), selected];
  return (
    <>
      <Legend selected={selected} />
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 64, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={20} />
          <YAxis {...axisProps} domain={[lo, hi * 1.05]} tickFormatter={moneyShort} width={60} />
          <Tooltip cursor={{ stroke: C.axis, strokeDasharray: "3 3" }} content={<ScenarioTooltip refLabel={refLabel} refValue={refValue} />} />
          <ReferenceLine y={refValue} stroke={C.reference} strokeDasharray="5 4" label={{ value: refLabel, position: "insideBottomLeft", fill: C.axis, fontSize: 11 }} />
          {lo < 0 && <ReferenceLine y={0} stroke="#a1a1aa" />}
          {order.map((k) => (
            <Line
              key={k}
              dataKey={k}
              name={SCENARIO_LABEL[k]}
              type="linear"
              stroke={SCENARIO_COLOR[k]}
              strokeWidth={k === selected ? 3 : 2}
              strokeOpacity={k === selected ? 1 : 0.55}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={k}
                content={({ x, y, index, value: v }) =>
                  index === data.length - 1 ? (
                    <text x={Number(x) + 6} y={Number(y)} dominantBaseline="central" fontSize={11} fill="#3f3f46" fontWeight={k === selected ? 600 : 400}>
                      {moneyShort(Number(v))}
                    </text>
                  ) : null
                }
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

export function CashChart() {
  const { forecast } = useModel();
  return (
    <Card title="Closing cash by week" subtitle="After drawing on the credit facility to protect minimum cash">
      <ScenarioLines value={(w) => w.closingCash} refValue={forecast.settings.minimumCash} refLabel="Minimum cash" />
    </Card>
  );
}

export function LiquidityChart() {
  const { forecast } = useModel();
  return (
    <Card title="Liquidity vs covenant" subtitle="Cash plus undrawn facility. Below the dashed line is a covenant breach">
      <ScenarioLines value={(w) => w.liquidity} refValue={forecast.settings.covenantMinLiquidity} refLabel="Covenant minimum" />
    </Card>
  );
}

/** Waterfall from opening to closing cash for the selected scenario */
export function BridgeChart() {
  const { results, selected, forecast } = useModel();
  const r = results[selected];
  const s = forecast.settings;
  const steps: { name: string; delta: number; kind: "total" | "up" | "down" }[] = [
    { name: "Opening cash", delta: s.openingCash, kind: "total" },
    ...r.byCategory.filter((c) => c.type === "receipt").map((c) => ({ name: c.category.replace("Collections – ", "Collections: "), delta: c.total, kind: "up" as const })),
    ...r.byCategory.filter((c) => c.type === "payment").map((c) => ({ name: c.category, delta: -c.total, kind: "down" as const }))
  ];
  if (r.summary.totalInterest > 0.5) steps.push({ name: "Facility interest", delta: -r.summary.totalInterest, kind: "down" });
  const netRcf = r.weeks.reduce((t, w) => t + w.rcfMovement, 0);
  if (Math.abs(netRcf) > 0.5) steps.push({ name: netRcf > 0 ? "Facility drawn" : "Facility repaid", delta: netRcf, kind: netRcf > 0 ? "up" : "down" });

  let running = 0;
  const data = steps.map((st) => {
    const start = st.kind === "total" ? 0 : running;
    running = st.kind === "total" ? st.delta : running + st.delta;
    const end = running;
    return { name: st.name, range: [Math.min(start, end), Math.max(start, end)] as [number, number], delta: st.delta, kind: st.kind };
  });
  data.push({ name: "Closing cash", range: [Math.min(0, running), Math.max(0, running)], delta: running, kind: "total" });

  return (
    <Card title={`Cash bridge: ${SCENARIO_LABEL[selected].toLowerCase()}`} subtitle="How opening cash becomes closing cash over the 13 weeks">
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 72 }} barCategoryGap={4}>
          <XAxis type="number" hide domain={["dataMin", "dataMax"]} />
          <YAxis type="category" dataKey="name" width={150} {...axisProps} interval={0} tick={{ fontSize: 11, fill: C.axis }} />
          <Tooltip
            cursor={{ fill: "#f4f4f5" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                  <p className="font-medium text-zinc-900">{payload[0].payload.name}</p>
                  <p className="text-zinc-600 tabular-nums">{money(payload[0].payload.delta)}</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="range" radius={2} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.kind === "total" ? C.total : d.kind === "up" ? C.increase : C.decrease} />
            ))}
            <LabelList
              dataKey="delta"
              content={({ x, y, width, height, index }) => {
                const d = data[index as number];
                return (
                  <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2} dominantBaseline="central" fontSize={11} fill="#3f3f46">
                    {d.kind === "down" ? `−${moneyShort(-d.delta)}` : moneyShort(d.delta)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 text-xs text-zinc-600 mt-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.increase }} /> Cash in</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.decrease }} /> Cash out</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.total }} /> Balance</span>
      </div>
    </Card>
  );
}
