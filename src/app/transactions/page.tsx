"use client";

import { useEffect, useMemo, useState } from "react";
import TransactionEditModal from "@/components/TransactionEditModal";
import { formatDateLabel, formatYen, typeLabel } from "@/lib/format";
import { TransactionWithJoins } from "@/lib/repo";
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

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts ?? []);
        setCategories(data.categories ?? []);
      });
  }, []);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (yearMonth) sp.set("yearMonth", yearMonth);
    if (accountId) sp.set("accountId", accountId);
    if (categoryId) sp.set("categoryId", categoryId);
    if (type) sp.set("type", type);
    if (search) sp.set("search", search);
    sp.set("page", String(page));
    sp.set("pageSize", String(PAGE_SIZE));
    return sp.toString();
  }, [yearMonth, accountId, categoryId, type, search, page]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/transactions?${query}`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      });
  }, [query]);

  useEffect(() => {
    setPage(1);
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">明細</h1>

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
          {grouped.map((group) => (
            <div key={group.date}>
              <div className="mb-1 px-1 text-xs font-semibold text-slate-400">
                {formatDateLabel(group.date)}
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {group.items.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => setEditing(item)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                      i !== 0 ? "border-t border-slate-100" : ""
                    }`}
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
