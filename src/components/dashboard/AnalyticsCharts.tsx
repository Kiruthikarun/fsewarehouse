"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CapacityRow,
  StatusBreakdown,
  ThroughputRow,
  TopMover,
} from "@/lib/bigquery";

// Shared "control-room screen" palette — matches the velocity line graph so
// every chart reads as the same dark instrument panel.
const INBOUND = "#38bdf8";
const OUTBOUND = "#ff6a1a";
const AXIS = "rgba(232,237,246,0.74)";
const GRID = "rgba(232,237,246,0.12)";
const CURSOR = "rgba(255,255,255,0.06)";

const STATUS_META: Record<keyof StatusBreakdown, { label: string; color: string }> = {
  FAST: { label: "Fast movers", color: "#1f9d55" },
  OK: { label: "Healthy", color: "#94a3b8" },
  LOW: { label: "Low stock", color: "#c77700" },
  DEAD: { label: "Dead stock", color: "#d33a2c" },
};

const tooltipStyle = {
  background: "#0b0f1a",
  border: "1px solid rgba(232,237,246,0.15)",
  borderRadius: 10,
  color: "#e8edf6",
  fontSize: 12,
  boxShadow: "0 12px 32px -12px rgba(0,0,0,0.6)",
} as const;

// recharts doesn't reliably inherit contentStyle.color onto the label/item
// text, so set them explicitly — otherwise they fall back to black (invisible
// on the dark tooltip).
const tooltipLabelStyle = { color: "#e8edf6", fontWeight: 600, marginBottom: 2 } as const;
const tooltipItemStyle = { color: "#e8edf6" } as const;

function Empty({ label }: { label: string }) {
  return (
    <div
      className="flex h-[260px] items-center justify-center text-sm"
      style={{ color: "rgba(232,237,246,0.66)" }}
    >
      {label}
    </div>
  );
}

/* ── Axis label helpers ───────────────────────────────────────────────────────
 * Warehouse names ("Coastal Logistics Scale DC 1") are long; the charts used to
 * hard-truncate them. Instead we wrap (vertical axis, room on the left) or angle
 * (bottom axis, room below) so full names read on screen, with the tooltip as a
 * guaranteed fallback for anything still clipped.
 */

// Greedy word-wrap into at most `maxLines` lines of ~`maxChars`. The final line
// absorbs any overflow and is ellipsised so a runaway label can't break layout.
function wrapLabel(text: string, maxChars: number, maxLines = 2): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const cand = cur ? `${cur} ${words[i]}` : words[i]!;
    if (cand.length <= maxChars || cur === "") {
      cur = cand;
    } else {
      lines.push(cur);
      cur = words[i]!;
      if (lines.length === maxLines - 1) {
        cur = [cur, ...words.slice(i + 1)].join(" ");
        break;
      }
    }
  }
  lines.push(cur);
  return lines.map((l) =>
    l.length > maxChars ? `${l.slice(0, maxChars - 1).trimEnd()}…` : l,
  );
}

// Multi-line tick for a vertical (category-on-Y) axis — used by CapacityChart.
function WrappedYTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string };
  maxChars?: number;
}) {
  const { x = 0, y = 0, payload, maxChars = 16 } = props;
  const lines = wrapLabel(String(payload?.value ?? ""), maxChars);
  const lineH = 12;
  const startDy = -((lines.length - 1) * lineH) / 2;
  return (
    <text
      x={x}
      y={y}
      dx={-6}
      textAnchor="end"
      dominantBaseline="central"
      fontSize={11}
      fill={AXIS}
    >
      {lines.map((ln, i) => (
        <tspan key={i} x={x - 6} dy={i === 0 ? startDy : lineH}>
          {ln}
        </tspan>
      ))}
    </text>
  );
}

// Angled tick for a bottom (category-on-X) axis — used by WarehouseThroughputChart.
function AngledXTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string };
  maxChars?: number;
}) {
  const { x = 0, y = 0, payload, maxChars = 22 } = props;
  const raw = String(payload?.value ?? "");
  const label =
    raw.length > maxChars ? `${raw.slice(0, maxChars - 1).trimEnd()}…` : raw;
  return (
    <text
      x={x}
      y={y}
      dy={4}
      dx={-2}
      transform={`rotate(-28, ${x}, ${y})`}
      textAnchor="end"
      fontSize={11}
      fill={AXIS}
    >
      {label}
    </text>
  );
}

/* ── Throughput by warehouse (grouped bars) — broad / admin ───────────────── */

export function WarehouseThroughputChart({ data }: { data: ThroughputRow[] }) {
  if (!data.length) return <Empty label="No movements in this window." />;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 56, left: -12 }} barGap={4}>
        <XAxis
          dataKey="warehouse_name"
          tick={<AngledXTick maxChars={22} />}
          height={64}
          stroke={GRID}
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          cursor={{ fill: CURSOR }}
        />
        <Bar dataKey="inbound" name="Inbound" fill={INBOUND} radius={[3, 3, 0, 0]} />
        <Bar dataKey="outbound" name="Outbound" fill={OUTBOUND} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Capacity utilisation (horizontal, colour-graded) — broad / admin ─────── */

function utilColor(pct: number): string {
  if (pct >= 90) return "#d33a2c";
  if (pct >= 75) return "#c77700";
  return "#1f9d55";
}

export function CapacityChart({ data }: { data: CapacityRow[] }) {
  if (!data.length) return <Empty label="No warehouses to show." />;
  const rows = data.map((r) => ({
    name: r.warehouse_name,
    pct: r.utilisation == null ? 0 : Math.round(r.utilisation * 100),
    units: r.units,
    capacity: r.capacity,
  }));
  const height = Math.max(200, rows.length * 48);
  // Size the label gutter to the longest name (wrapped across 2 lines), capped
  // so the bars keep a usable plot width. maxChars is derived from that width so
  // the wrap and the gutter always agree.
  const longest = rows.reduce((m, r) => Math.max(m, r.name.length), 0);
  const axisWidth = Math.min(
    196,
    Math.max(104, Math.round((Math.ceil(longest / 2) + 4) * 6.6) + 20),
  );
  const maxChars = Math.max(10, Math.floor((axisWidth - 16) / 6.6));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={rows}
        margin={{ top: 0, right: 44, bottom: 0, left: 8 }}
      >
        <XAxis
          type="number"
          domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]}
          tick={{ fontSize: 11, fill: AXIS }}
          stroke={GRID}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={axisWidth}
          tick={<WrappedYTick maxChars={maxChars} />}
          stroke={GRID}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          cursor={{ fill: CURSOR }}
          formatter={(_v, _n, p: { payload?: { units: number; capacity: number; pct: number } }) => {
            const d = p.payload;
            return d ? [`${d.pct}%  ·  ${d.units.toLocaleString()} / ${d.capacity.toLocaleString()} units`, "Utilisation"] : [_v, _n];
          }}
        />
        <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={18}>
          {rows.map((r) => (
            <Cell key={r.name} fill={utilColor(r.pct)} />
          ))}
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v: number) => `${v}%`}
            fill="rgba(232,237,246,0.85)"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Top movers by outbound (horizontal) — detailed / manager ─────────────── */

export function TopMoversChart({ data }: { data: TopMover[] }) {
  if (!data.length) return <Empty label="No outbound activity in this window." />;
  const height = Math.max(200, data.length * 38);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 0, right: 28, bottom: 0, left: 8 }}
      >
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
        <YAxis
          type="category"
          dataKey="sku"
          width={96}
          tick={{ fontSize: 11, fill: AXIS }}
          stroke={GRID}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          cursor={{ fill: CURSOR }}
          formatter={(v: number, _n, p: { payload?: TopMover }) => [
            `${v.toLocaleString()} units out`,
            p.payload?.item_name ?? "Outbound",
          ]}
        />
        <Bar dataKey="outbound" fill={OUTBOUND} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Inventory status donut — both roles ──────────────────────────────────── */

const RADIAN = Math.PI / 180;

// Leader-line label: a kinked line from each slice's outer edge out to its
// section name, so every wedge is annotated directly on the chart.
function renderStatusLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  payload,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  payload: { label: string; color: string };
}) {
  const cos = Math.cos(-midAngle * RADIAN);
  const sin = Math.sin(-midAngle * RADIAN);
  const sx = cx + outerRadius * cos; // anchor on the slice edge
  const sy = cy + outerRadius * sin;
  const mx = cx + (outerRadius + 14) * cos; // elbow
  const my = cy + (outerRadius + 14) * sin;
  const right = cos >= 0;
  const ex = mx + (right ? 1 : -1) * 18; // horizontal run
  const ey = my;

  return (
    <g>
      <polyline
        points={`${sx},${sy} ${mx},${my} ${ex},${ey}`}
        stroke={payload.color}
        strokeWidth={1}
        fill="none"
        opacity={0.75}
      />
      <circle cx={sx} cy={sy} r={1.8} fill={payload.color} />
      <text
        x={ex + (right ? 4 : -4)}
        y={ey}
        textAnchor={right ? "start" : "end"}
        dominantBaseline="central"
        fontSize={11}
        fill="rgba(232,237,246,0.85)"
      >
        {payload.label}
      </text>
    </g>
  );
}

export function StatusDonut({ data }: { data: StatusBreakdown }) {
  const order: (keyof StatusBreakdown)[] = ["FAST", "OK", "LOW", "DEAD"];
  const slices = order
    .map((k) => ({ key: k, value: data[k], ...STATUS_META[k] }))
    .filter((s) => s.value > 0);
  const total = order.reduce((a, k) => a + data[k], 0);

  if (total === 0) return <Empty label="No inventory to summarise." />;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4 py-2">
      <div className="relative shrink-0" style={{ width: 340, height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
              stroke="none"
              label={renderStatusLabel}
              labelLine={false}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v: number, n) => [`${v} SKUs`, n]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono text-2xl font-semibold leading-none"
            style={{ color: "#fff" }}
          >
            {total}
          </span>
          <span
            className="mt-0.5 text-[10px] uppercase tracking-wider"
            style={{ color: "rgba(232,237,246,0.66)" }}
          >
            SKUs
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 text-sm">
        {order.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: STATUS_META[k].color }}
            />
            <span style={{ color: "rgba(232,237,246,0.85)" }}>
              {STATUS_META[k].label}
            </span>
            <span
              className="ml-auto font-mono font-semibold"
              style={{ color: "#e8edf6" }}
            >
              {data[k]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
