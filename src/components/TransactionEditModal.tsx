"use client";

import { useState } from "react";
import { Category } from "@/lib/types";
import { formatDateLabel, formatYen, typeLabel } from "@/lib/format";
import { TransactionWithJoins } from "@/lib/repo";

export default function TransactionEditModal({
  transaction,
  categories,
  onClose,
  onSaved,
}: {
  transaction: TransactionWithJoins;
  categories: Category[];
  onClose: () => void;
  onSaved: (updated: TransactionWithJoins) => void;
}) {
  const [normalizedName, setNormalizedName] = useState(transaction.normalized_name);
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? "");
  const [memo, setMemo] = useState(transaction.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = {
    INCOME: categories.filter((c) => c.type === "INCOME"),
    EXPENSE: categories.filter((c) => c.type === "EXPENSE"),
    TRANSFER: categories.filter((c) => c.type === "TRANSFER"),
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedName, categoryId, memo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新に失敗しました");
      const cat = categories.find((c) => c.id === categoryId);
      onSaved({
        ...transaction,
        normalized_name: normalizedName,
        category_id: categoryId,
        category_name: cat?.name ?? null,
        category_color: cat?.color ?? null,
        type: cat?.type ?? transaction.type,
        memo,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-xs text-slate-400">
              {formatDateLabel(transaction.date)} ・ {transaction.account_name}
            </div>
            <div className="text-sm font-medium text-slate-700">
              {transaction.raw_description}
            </div>
          </div>
          <div className="text-right text-lg font-bold">
            {formatYen(transaction.amount)}
          </div>
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-600">集計名称</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={normalizedName}
            onChange={(e) => setNormalizedName(e.target.value)}
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-600">カテゴリ（取引種別は自動設定）</span>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <optgroup label="収入">
              {grouped.INCOME.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="支出">
              {grouped.EXPENSE.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="資金移動">
              {grouped.TRANSFER.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="mt-1 block text-xs text-slate-400">
            現在の取引種別: {typeLabel(transaction.type)}
          </span>
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-slate-600">メモ</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
