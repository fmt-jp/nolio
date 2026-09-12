"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatYen } from "@/lib/format";
import { TrendPoint } from "@/lib/summary";

export default function TrendBarChart({
  points,
  selectedLabel,
  onSelect,
}: {
  points: TrendPoint[];
  selectedLabel?: string;
  onSelect?: (label: string) => void;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        データがありません
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state) => {
            const label = state?.activeLabel;
            if (label && onSelect) onSelect(String(label));
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            width={44}
          />
          <Tooltip formatter={(value) => formatYen(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="income"
            name="収入"
            fill="#2563eb"
            radius={[4, 4, 0, 0]}
            cursor={onSelect ? "pointer" : undefined}
          >
            {points.map((p) => (
              <Cell
                key={p.label}
                fillOpacity={!selectedLabel || p.label === selectedLabel ? 1 : 0.35}
              />
            ))}
          </Bar>
          <Bar
            dataKey="expense"
            name="支出"
            fill="#f97316"
            radius={[4, 4, 0, 0]}
            cursor={onSelect ? "pointer" : undefined}
          >
            {points.map((p) => (
              <Cell
                key={p.label}
                fillOpacity={!selectedLabel || p.label === selectedLabel ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
