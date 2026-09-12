"use client";

import { formatYearMonthLabel, shiftYearMonth } from "@/lib/format";

export default function MonthSwitcher({
  yearMonth,
  onChange,
}: {
  yearMonth: string;
  onChange: (ym: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(shiftYearMonth(yearMonth, -1))}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
        aria-label="前の月"
      >
        ‹
      </button>
      <div className="min-w-32 text-center text-lg font-semibold">
        {formatYearMonthLabel(yearMonth)}
      </div>
      <button
        type="button"
        onClick={() => onChange(shiftYearMonth(yearMonth, 1))}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
        aria-label="次の月"
      >
        ›
      </button>
    </div>
  );
}
