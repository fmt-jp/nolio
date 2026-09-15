"use client";

import { useEffect, useMemo, useState } from "react";
import TransactionEditModal from "@/components/TransactionEditModal";
import BulkCategorizePanel from "@/components/BulkCategorizePanel";
import { formatDateLabel, formatYen, typeLabel } from "@/lib/format";
import {
  deleteAllTransactions,
  deleteTransactions,
  getMeta,
  listTransactions,
  TransactionFilter,
  TransactionWithJoins,
} from "@/lib/repo";
import { Account, Category, TxType } from "@/lib/types";

const PAGE_SIZE = 30;

export default function TransactionsPage() {
  const [items, setItems] = useState<TransactionWithJoins[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [yearMonth, setYearMonth] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<TxType | "">("");
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<TransactionWithJoins | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    getMeta().then((data) => {
      setAccounts(data.accounts);
      setCategories(data.categories);
    });
  }, []);

  const filter = useMemo<TransactionFilter>(
    () => ({
      yearMonth: yearMonth || undefined,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      type: type || undefined,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [yearMonth, accountId, categoryId, type, search, page]
  );

  useEffect(() => {
    setLoading(true);
    listTransactions(filter).then((data) => {
      setItems(data.items);
      setTotal(data.total);
      setLoading(false);
    });
  }, [filter]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [yearMonth, accountId, categoryId, type, search]);

  const grouped = useMemo(() => {
    const groups: { date: string; items: TransactionWithJoins[] }[] = [];
    for (const item of items) {
      const last = groups[groups.length - 1];
      if (last && last.date === item.date) last.items.push(item);
      else groups.push({ date: item.date, items: [item] });
    }
    return groups;
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allOnPageSelected = items.length > 0 && items.every((it) => selectedIds.has(it.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        items.forEach((it) => next.delete(it.id));
      } else {
        items.forEach((it) => next.add(it.id));
      }
      return next;
    });
  }

  async function refreshList() {
    const data = await listTransactions(filter);
    if (data.items.length === 0 && page > 1) {
      setPage((p) => p - 1);
    } else {
      setItems(data.items);
      setTotal(data.total);
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `選択した${selectedIds.size}件の明細を削除しますか？この操作は取り消せません。`
      )
    ) {
      return;
    }
    setDeleting(true);
    await deleteTransactions([...selectedIds]);
    setSelectedIds(new Set());
    await refreshList();
    setDeleting(false);
  }

  async function handleDeleteAll() {
    if (!confirm("すべての明細を削除しますか？この操作は取り消せません。")) return;
    if (!confirm("本当に削除してよろしいですか？すべての明細が完全に削除されます。")) return;
    setDeletingAll(true);
    await deleteAllTransactions();
    setSelectedIds(new Set());
    setPage(1);
    setItems([]);
    setTotal(0);
    setDeletingAll(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">明細</h1>
        <button
          onClick={handleDeleteAll}
          disabled={deletingAll}
          className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-50"
        >
          {deletingAll ? "削除中..." : "全削除"}
        </button>
      </div>

      <BulkCategorizePanel categories={categories} onApplied={refreshList} />

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-5">
        <input
          type="month"
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">すべての口座</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">すべてのカテゴリ</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as TxType | "")}
        >
          <option value="">すべての種別</option>
          <option value="INCOME">収入</option>
          <option value="EXPENSE">支出</option>
          <option value="TRANSFER">資金移動</option>
        </select>
        <input
          type="text"
          placeholder="明細名で検索"
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">
          条件に一致する明細がありません
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleSelectAllOnPage}
              />
              このページを全選択
            </label>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-500">{selectedIds.size}件選択中</span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  選択解除
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "削除中..." : "削除"}
                </button>
              </div>
            )}
          </div>

          {grouped.map((group) => (
            <div key={group.date}>
              <div className="mb-1 px-1 text-xs font-semibold text-slate-400">
                {formatDateLabel(group.date)}
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {group.items.map((item, i) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-1 px-4 py-1 hover:bg-slate-50 ${
                      i !== 0 ? "border-t border-slate-100" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="shrink-0"
                    />
                    <button
                      onClick={() => setEditing(item)}
                      className="flex flex-1 items-center justify-between gap-3 py-2 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">
                          {item.normalized_name}
                        </div>
                        {item.normalized_name !== item.raw_description && (
                          <div className="truncate text-xs text-slate-400">
                            元明細: {item.raw_description}
                          </div>
                        )}
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                          <span>{item.account_name}</span>
                          <span>・</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{
                              backgroundColor: `${item.category_color ?? "#e2e8f0"}22`,
                              color: item.category_color ?? "#475569",
                            }}
                          >
                            {item.category_name ?? "未分類"}
                          </span>
                          <span className="text-slate-300">{typeLabel(item.type)}</span>
                        </div>
                      </div>
                      <div
                        className={`shrink-0 text-sm font-semibold ${
                          item.type === "EXPENSE"
                            ? "text-orange-600"
                            : item.type === "INCOME"
                            ? "text-blue-600"
                            : "text-slate-400"
                        }`}
                      >
                        {formatYen(item.amount)}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-center gap-3 py-4 text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-30"
            >
              前へ
            </button>
            <span className="text-slate-500">
              {page} / {totalPages}（{total}件）
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-30"
            >
              次へ
            </button>
          </div>
        </div>
      )}

      {editing && (
        <TransactionEditModal
          transaction={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
