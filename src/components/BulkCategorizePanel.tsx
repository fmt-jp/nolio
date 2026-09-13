"use client";

import { useEffect, useState } from "react";
import { applyCategoryToGroup, getUncategorizedGroups, UncategorizedGroup } from "@/lib/importer";
import { formatYen, typeLabel } from "@/lib/format";
import { Category } from "@/lib/types";

const INITIAL_COUNT = 5;

function groupKey(g: UncategorizedGroup): string {
  return `${g.normalizedName}${g.type}`;
}

export default function BulkCategorizePanel({
  categories,
  onApplied,
}: {
  categories: Category[];
  onApplied: () => void;
}) {
  const [groups, setGroups] = useState<UncategorizedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  function load() {
    setLoading(true);
    getUncategorizedGroups().then((data) => {
      setGroups(data);
      setSelections((prev) => {
        const next = { ...prev };
        for (const g of data) {
          const key = groupKey(g);
          if (!(key in next) && g.suggestedCategoryId) next[key] = g.suggestedCategoryId;
        }
        return next;
      });
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function apply(g: UncategorizedGroup) {
    const key = groupKey(g);
    const categoryId = selections[key];
    if (!categoryId) return;
    setApplyingKey(key);
    await applyCategoryToGroup(g.transactionIds, categoryId, g.normalizedName);
    setApplyingKey(null);
    load();
    onApplied();
  }

  if (loading || groups.length === 0) return null;

  const options = {
    INCOME: categories.filter((c) => c.type === "INCOME" && !c.is_system),
    EXPENSE: categories.filter((c) => c.type === "EXPENSE" && !c.is_system),
  };
  const visible = expanded ? groups : groups.slice(0, INITIAL_COUNT);
  const totalCount = groups.reduce((s, g) => s + g.count, 0);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="mb-1 text-sm font-semibold text-amber-800">
        未分類をまとめて分類（お店 {groups.length}件・明細 {totalCount}件）
      </h2>
      <p className="mb-3 text-xs text-amber-700">
        お店ごとにカテゴリを選んで「適用」を押すと、同じ名前の明細がまとめて分類され、次回以降の取り込みにも自動的に適用されます。候補が入っている場合はよくある店舗名から自動提案したものです。
      </p>
      <div className="flex flex-col gap-2">
        {visible.map((g) => {
          const key = groupKey(g);
          const opts = options[g.type];
          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-700">
                  {g.normalizedName}
                </div>
                <div className="text-xs text-slate-400">
                  {g.count}件・合計 {formatYen(g.totalAmount)}・{typeLabel(g.type)}
                </div>
              </div>
              <select
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={selections[key] ?? ""}
                onChange={(e) =>
                  setSelections((prev) => ({ ...prev, [key]: e.target.value }))
                }
              >
                <option value="">カテゴリを選択</option>
                {opts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => apply(g)}
                disabled={!selections[key] || applyingKey === key}
                className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
              >
                {applyingKey === key ? "適用中..." : "適用"}
              </button>
            </div>
          );
        })}
      </div>
      {groups.length > INITIAL_COUNT && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-medium text-amber-700 hover:text-amber-900"
        >
          {expanded ? "折りたたむ" : `すべて表示（${groups.length}件）`}
        </button>
      )}
    </div>
  );
}
