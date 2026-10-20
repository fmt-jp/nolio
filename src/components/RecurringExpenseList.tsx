"use client";

import { formatYen } from "@/lib/format";
import { RecurringExpense } from "@/lib/insights";

export default function RecurringExpenseList({ items }: { items: RecurringExpense[] }) {
  const active = items.filter((i) => i.active);
  const ended = items.filter((i) => !i.active);

  if (items.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-center text-sm text-slate-400">
        定期的な支出は見つかりませんでした
        <br />
        （同じ支払先に3か月以上連続で同額の支出があると検出します）
      </div>
    );
  }

  const monthlyTotal = active.reduce((s, i) => s + i.monthlyAmount, 0);
  const yearlyTotal = active.reduce((s, i) => s + i.yearlyAmount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">継続中の定期支出（月額換算）</div>
          <div className="mt-1 text-lg font-bold text-orange-600">{formatYen(monthlyTotal)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">年間換算</div>
          <div className="mt-1 text-lg font-bold text-orange-600">{formatYen(yearlyTotal)}</div>
        </div>
      </div>
      <RecurringRows items={active} />
      {ended.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-slate-400">最近は請求がないもの（解約済みの可能性）</div>
          <RecurringRows items={ended} muted />
        </div>
      )}
    </div>
  );
}

function RecurringRows({ items, muted }: { items: RecurringExpense[]; muted?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-slate-100">
      {items.map((item) => (
        <div
          key={`${item.name}-${item.cadence}`}
          className={`flex items-center justify-between gap-3 py-2 ${muted ? "opacity-60" : ""}`}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-700">{item.name}</div>
            <div className="text-xs text-slate-400">
              {item.cadence === "MONTHLY" ? `毎月 / ${item.count}か月連続` : "毎年"}・最終 {item.lastDate}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-slate-800">
              {formatYen(item.amount)}
              <span className="ml-1 text-xs font-normal text-slate-400">
                /{item.cadence === "MONTHLY" ? "月" : "年"}
              </span>
            </div>
            <div className="text-xs text-slate-400">年 {formatYen(item.yearlyAmount)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
