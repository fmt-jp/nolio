"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatYen } from "@/lib/format";
import { CategoryBreakdownItem } from "@/lib/summary";

const FALLBACK_COLORS = [
  "#2563eb",
  "#f97316",
  "#10b981",
  "#a855f7",
  "#ec4899",
  "#eab308",
  "#0891b2",
  "#ef4444",
];

export default function CategoryPieChart({
  data,
}: {
  data: CategoryBreakdownItem[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-400">
        データがありません
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="categoryName"
            innerRadius={50}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((entry, i) => (
              <Cell
                key={entry.categoryId ?? `none-${i}`}
                fill={entry.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [formatYen(Number(value)), String(name)]}
          />
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
