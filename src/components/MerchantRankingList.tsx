"use client";

import { useState } from "react";
import { formatYen } from "@/lib/format";
import { MerchantBreakdownItem } from "@/lib/summary";

const INITIAL_COUNT = 10;

export default function MerchantRankingList({ items }: { items: MerchantBreakdownItem[] }) {
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-slate-400">
        データがありません
      </div>
    );
  }

  const visible = showAll ? items : items.slice(0, INITIAL_COUNT);
  const maxAmount = items[0]?.amount || 1;

  return (
    <div className="flex flex-col gap-3">
      {visible.map((item, i) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-right text-xs text-slate-400">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-slate-700">{item.name}</span>
              <span className="shrink-0 text-sm font-semibold text-slate-800">
                {formatYen(item.amount)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-400"
                style={{ width: `${Math.max(2, (item.amount / maxAmount) * 100)}%` }}
              />
            </div>
          </div>
          <span className="w-12 shrink-0 text-right text-xs text-slate-400">{item.count}件</span>
        </div>
      ))}
      {items.length > INITIAL_COUNT && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {showAll ? "折りたたむ" : `すべて表示（${items.length}件）`}
        </button>
      )}
    </div>
  );
}
