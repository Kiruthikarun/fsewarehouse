"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VelocityPoint } from "@/lib/bigquery";

const INBOUND = "#38bdf8";
const OUTBOUND = "#ff6a1a";

/**
 * 90-day inbound vs outbound area chart. `dark` tunes axis/grid colours for the
 * inverted control-room panel on the dashboard.
 */
export function VelocityChart({
  data,
  dark = false,
}: {
  data: VelocityPoint[];
  dark?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex h-72 items-center justify-center text-sm"
        style={{ color: dark ? "rgba(232,237,246,0.5)" : "#94a3b8" }}
      >
        No movement data in the last 90 days.
      </div>
    );
  }

  const axisColor = dark ? "rgba(232,237,246,0.55)" : "#64748b";
  const gridColor = dark ? "rgba(232,237,246,0.10)" : "#e2e8f0";

  return (
    <ResponsiveContainer width="100%" height={288}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="grad-in" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={INBOUND} stopOpacity={0.55} />
            <stop offset="95%" stopColor={INBOUND} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-out" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={OUTBOUND} stopOpacity={0.55} />
            <stop offset="95%" stopColor={OUTBOUND} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: axisColor }}
          tickFormatter={(d: string) => d.slice(5)}
          minTickGap={24}
          stroke={gridColor}
        />
        <YAxis tick={{ fontSize: 11, fill: axisColor }} stroke={gridColor} />
        <Tooltip
          contentStyle={
            dark
              ? {
                  background: "#0b0f1a",
                  border: "1px solid rgba(232,237,246,0.15)",
                  borderRadius: 10,
                  color: "#e8edf6",
                  fontSize: 12,
                }
              : { borderRadius: 10, fontSize: 12 }
          }
          // recharts won't inherit the dark colour onto the label, so it falls
          // back to black (invisible). Force it light in dark mode.
          labelStyle={dark ? { color: "#e8edf6", fontWeight: 600 } : undefined}
          itemStyle={dark ? { color: "#e8edf6" } : undefined}
        />
        <Area
          type="monotone"
          dataKey="inbound"
          name="Inbound"
          stroke={INBOUND}
          fill="url(#grad-in)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="outbound"
          name="Outbound"
          stroke={OUTBOUND}
          fill="url(#grad-out)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
