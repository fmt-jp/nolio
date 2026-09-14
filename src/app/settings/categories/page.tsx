"use client";

import { useEffect, useRef, useState } from "react";
import { createCategory, deleteCategory, listCategories, updateCategory } from "@/lib/repo";
import { Category, TxType } from "@/lib/types";

const TYPE_LABELS: Record<TxType, string> = {
  INCOME: "収入",
  EXPENSE: "支出",
  TRANSFER: "資金移動",
};

const TYPE_ORDER: TxType[] = ["INCOME", "EXPENSE", "TRANSFER"];

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function CategoriesSettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<TxType>("EXPENSE");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    listCategories().then((data) => {
      setCategories(data);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleAdd() {
    if (!newName.trim()) return;
    setError(null);
    try {
      await createCategory({ name: newName.trim(), type: newType });
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
      return;
    }
    setNewName("");
    load();
  }

  async function handleRename(id: string, name: string) {
    await updateCategory(id, { name });
    load();
  }

  async function handleColorChange(id: string, color: string) {
    await updateCategory(id, { color });
    load();
  }

  async function handleMove(list: Category[], index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const a = list[index];
    const b = list[targetIndex];
    await Promise.all([
      updateCategory(a.id, { sortOrder: b.sort_order }),
      updateCategory(b.id, { sortOrder: a.sort_order }),
    ]);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("このカテゴリを削除しますか？関連する明細は未分類に移動します。")) return;
    try {
      await deleteCategory(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除できません");
      return;
    }
    load();
  }

  function exportCategories() {
    downloadJson("nolio_categories.json", {
      kind: "nolio-categories",
      version: 1,
      categories: categories.map((c) => ({
        name: c.name,
        type: c.type,
        color: c.color,
        sortOrder: c.sort_order,
      })),
    });
  }

  async function importCategories(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.kind !== "nolio-categories" || !Array.isArray(data.categories)) {
        throw new Error("カテゴリ定義のファイルではないようです");
      }
      if (
        !confirm(
          `ファイルの内容（${data.categories.length}件）を現在のカテゴリ定義にマージします。名称・種別が一致すれば色や並び順を更新し、一致しなければ新しいカテゴリとして追加します。既存のカテゴリが削除されることはありません。よろしいですか？`
        )
      ) {
        return;
      }
      const current = await listCategories();
      const byKey = new Map(current.map((c) => [JSON.stringify([c.name, c.type]), c]));
      for (const item of data.categories as {
        name: string;
        type: TxType;
        color?: string | null;
        sortOrder?: number;
      }[]) {
        if (!item.name || !item.type) continue;
        const key = JSON.stringify([item.name, item.type]);
        const existing = byKey.get(key);
        if (existing) {
          await updateCategory(existing.id, {
            color: item.color ?? existing.color,
            sortOrder: item.sortOrder ?? existing.sort_order,
          });
        } else {
          const created = await createCategory({
            name: item.name,
            type: item.type,
            color: item.color ?? null,
          });
          if (item.sortOrder !== undefined) {
            await updateCategory(created.id, { sortOrder: item.sortOrder });
          }
          byKey.set(key, created);
        }
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "インポートに失敗しました");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">カテゴリ設定</h1>
        <div className="flex gap-2">
          <button
            onClick={exportCategories}
            disabled={categories.length === 0}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
          >
            エクスポート
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            インポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCategories(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">カテゴリを追加</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="カテゴリ名"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            value={newType}
            onChange={(e) => setNewType(e.target.value as TxType)}
          >
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            追加
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">読み込み中...</p>
      ) : (
        TYPE_ORDER.map((t) => {
          const list = categories.filter((c) => c.type === t);
          return (
            <div key={t} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-600">
                {TYPE_LABELS[t]}
              </h2>
              <div className="flex flex-col gap-1">
                {list.map((c, i) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex shrink-0 flex-col leading-none text-slate-300">
                        <button
                          onClick={() => handleMove(list, i, -1)}
                          disabled={i === 0}
                          className="hover:text-slate-600 disabled:opacity-20"
                          title="上へ"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMove(list, i, 1)}
                          disabled={i === list.length - 1}
                          className="hover:text-slate-600 disabled:opacity-20"
                          title="下へ"
                        >
                          ▼
                        </button>
                      </div>
                      <input
                        type="color"
                        value={c.color ?? "#94a3b8"}
                        onChange={(e) => handleColorChange(c.id, e.target.value)}
                        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-slate-200 p-0"
                        title="色を変更"
                      />
                      <input
                        defaultValue={c.name}
                        onBlur={(e) => {
                          if (e.target.value !== c.name && e.target.value.trim()) {
                            handleRename(c.id, e.target.value.trim());
                          }
                        }}
                        className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 text-sm hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                      />
                      {!!c.is_system && (
                        <span className="shrink-0 text-xs text-slate-300">(未分類)</span>
                      )}
                    </div>
                    {!c.is_system && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="shrink-0 text-xs text-slate-400 hover:text-red-500"
                      >
                        削除
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
