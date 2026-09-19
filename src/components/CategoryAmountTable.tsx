"use client";

import ComparisonChip from "./ComparisonChip";
import { computeDelta, formatYen } from "@/lib/format";
import { CategoryBreakdownItem } from "@/lib/summary";

export default function CategoryAmountTable({
  items,
  selectedKey,
  onSelect,
  comparison,
}: {
  items: CategoryBreakdownItem[];
  selectedKey?: string | null;
  onSelect?: (item: CategoryBreakdownItem) => void;
  comparison?: {
    goodDirection: "up" | "down";
    previousLabel: string;
    averageLabel: string;
  };
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-slate-400">
        データがありません
      </div>
    );
  }

  const total = items.reduce((s, i) => s + i.amount, 0);
  const totalPrevious = items.reduce((s, i) => s + i.previousAmount, 0);
  const totalAverage = items.reduce((s, i) => s + i.averageAmount, 0);

  return (
    <div className="overflow-x-auto">
      {/* WebKit "font boosting" can still resize text inside <table> cells based on
          content length even with -webkit-text-size-adjust:100% set globally on html,
          so it's reinforced here directly on the table itself. */}
      <table className="w-full text-sm" style={{ WebkitTextSizeAdjust: "100%" }}>
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="pb-2 font-normal">カテゴリ</th>
            <th className="pb-2 text-right font-normal">金額</th>
            <th className="pb-2 text-right font-normal">割合</th>
            {comparison && (
              <>
                <th className="pb-2 pl-3 text-right font-normal">{comparison.previousLabel}</th>
                <th className="pb-2 pl-3 text-right font-normal">{comparison.averageLabel}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const key = item.categoryId ?? item.categoryName;
            const selected = selectedKey != null && key === selectedKey;
            return (
              <tr
                key={key}
                onClick={onSelect ? () => onSelect(item) : undefined}
                className={`border-b border-slate-50 last:border-0 ${
                  onSelect ? "cursor-pointer hover:bg-slate-50" : ""
                } ${selected ? "bg-slate-50" : ""}`}
              >
                <td className="py-2">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: item.color ?? "#94a3b8" }}
                  />
                  <span
                    className={`align-middle text-slate-700 ${selected ? "font-semibold" : ""}`}
                  >
                    {item.categoryName}
                  </span>
                </td>
                <td className="py-2 text-right font-medium tabular-nums text-slate-800">
                  {formatYen(item.amount)}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-400">
                  {(item.ratio * 100).toFixed(1)}%
                </td>
                {comparison && (
                  <>
                    <td className="py-2 pl-3 text-right">
                      <ComparisonChip
                        delta={computeDelta(item.amount, item.previousAmount)}
                        goodDirection={comparison.goodDirection}
                      />
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <ComparisonChip
                        delta={computeDelta(item.amount, item.averageAmount)}
                        goodDirection={comparison.goodDirection}
                      />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 text-sm font-semibold">
            <td className="pt-2 text-slate-600">合計</td>
            <td className="pt-2 text-right tabular-nums text-slate-800">{formatYen(total)}</td>
            <td className="pt-2 text-right tabular-nums text-slate-400">100.0%</td>
            {comparison && (
              <>
                <td className="pt-2 pl-3 text-right">
                  <ComparisonChip
                    delta={computeDelta(total, totalPrevious)}
                    goodDirection={comparison.goodDirection}
                  />
                </td>
                <td className="pt-2 pl-3 text-right">
                  <ComparisonChip
                    delta={computeDelta(total, totalAverage)}
                    goodDirection={comparison.goodDirection}
                  />
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
