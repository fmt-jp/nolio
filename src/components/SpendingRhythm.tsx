"use client";

import { formatYen } from "@/lib/format";
import { SpendingRhythm as Rhythm } from "@/lib/insights";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 5 intensity steps; 0 yen stays blank so empty days read as "no spending". */
function cellClass(amount: number, max: number): string {
  if (amount <= 0 || max <= 0) return "bg-slate-50 text-slate-300";
  const r = amount / max;
  if (r > 0.75) return "bg-orange-500 text-white";
  if (r > 0.5) return "bg-orange-400 text-white";
  if (r > 0.25) return "bg-orange-300 text-slate-800";
  return "bg-orange-100 text-slate-700";
}

export default function SpendingRhythm({
  rhythm,
  unit,
  period,
}: {
  rhythm: Rhythm;
  unit: "month" | "year";
  period: string;
}) {
  if (rhythm.total === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-slate-400">
        データがありません
      </div>
    );
  }

  const maxDay = Math.max(...rhythm.days.map((d) => d.amount));
  const maxWeekday = Math.max(...rhythm.weekdays.map((w) => w.average)) || 1;
  const maxTen = Math.max(...rhythm.tenDays.map((t) => t.total)) || 1;
  const topWeekday = [...rhythm.weekdays].sort((a, b) => b.average - a.average)[0];

  let leading: (string | null)[] = [];
  if (unit === "month") {
    const [y, m] = period.split("-").map(Number);
    leading = new Array<null>(new Date(y, m - 1, 1).getDay()).fill(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-600">
        1日あたりの支出が最も多いのは
        <span className="mx-1 font-semibold text-orange-600">{WEEKDAY_LABELS[topWeekday.weekday]}曜日</span>
        （平均 {formatYen(topWeekday.average)}）です。
      </p>

      {unit === "month" && (
        <div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {leading.map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {rhythm.days.map((d) => (
              <div
                key={d.date}
                title={`${d.date} ${formatYen(d.amount)}`}
                className={`flex aspect-square flex-col items-center justify-center rounded-md text-xs ${cellClass(
                  d.amount,
                  maxDay
                )}`}
              >
                <span>{Number(d.date.slice(8, 10))}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 text-right text-xs text-slate-400">
            濃いほど支出が多い日（最大 {formatYen(maxDay)}）
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-slate-500">曜日別の1日あたり平均</h3>
          <div className="flex flex-col gap-1.5">
            {rhythm.weekdays.map((w) => (
              <BarRow
                key={w.weekday}
                label={`${WEEKDAY_LABELS[w.weekday]}曜`}
                value={w.average}
                max={maxWeekday}
              />
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold text-slate-500">月内のタイミング別合計</h3>
          <div className="flex flex-col gap-1.5">
            {rhythm.tenDays.map((t) => (
              <BarRow key={t.label} label={t.label} value={t.total} max={maxTen} wide />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  wide,
}: {
  label: string;
  value: number;
  max: number;
  wide?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`shrink-0 text-slate-500 ${wide ? "w-24" : "w-8"}`}>{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-orange-400"
          style={{ width: `${Math.max(value > 0 ? 2 : 0, (value / max) * 100)}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-slate-700">{formatYen(value)}</span>
    </div>
  );
}
