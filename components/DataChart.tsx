"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartSpec } from "@/lib/types";

interface DataChartProps {
  chart: ChartSpec;
}

function truncate(label: string): string {
  if (label.length > 14) {
    return `${label.slice(0, 13)}…`;
  }
  return label;
}

const axisTick = { fill: "#6b6661", fontSize: 10 } as const;

export default function DataChart({ chart }: DataChartProps) {
  const data = chart.series;

  return (
    <div className="animate-fade-rise bg-surface border border-border rounded-xl p-4">
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid stroke="#1f1f1f" vertical={false} />
              <XAxis
                dataKey="x"
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: "#1f1f1f" }}
                interval="preserveStartEnd"
                minTickGap={24}
                tickFormatter={truncate}
              />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: "#121212",
                  border: "1px solid #1f1f1f",
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
                labelStyle={{ color: "#e8e4dc" }}
                itemStyle={{ color: "#c1121f" }}
              />
              <Line
                dataKey="y"
                stroke="#c1121f"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid stroke="#1f1f1f" vertical={false} />
              <XAxis
                dataKey="x"
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: "#1f1f1f" }}
                interval="preserveStartEnd"
                minTickGap={24}
                tickFormatter={truncate}
              />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: "#121212",
                  border: "1px solid #1f1f1f",
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
                labelStyle={{ color: "#e8e4dc" }}
                itemStyle={{ color: "#c1121f" }}
              />
              <Bar dataKey="y" fill="#c1121f" radius={[3, 3, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="text-muted text-xs mt-2">
        {`${chart.xLabel} — ${chart.yLabel}`}
      </p>
    </div>
  );
}
