"use client";

import { useState } from "react";
import { decodeBuffer } from "@/lib/csv";
import {
  CategoryImportDecision,
  MissingCategoryInfo,
  previewNolioExportCategories,
  restoreFromNolioExport,
  RestoreResult,
} from "@/lib/importer";
import { listCategories } from "@/lib/repo";
import { Category } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  INCOME: "収入",
  EXPENSE: "支出",
  TRANSFER: "資金移動",
};

export default function RestoreFromExport({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const [pendingText, setPendingText] = useState<string | null>(null);
  const [missing, setMissing] = useState<MissingCategoryInfo[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [decisions, setDecisions] = useState<Record<string, CategoryImportDecision>>({});

  async function handleRestore() {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const text = decodeBuffer(buf, "UTF8");
      const missingCategories = await previewNolioExportCategories(text);
      if (missingCategories.length === 0) {
        await doCommit(text, undefined);
        return;
      }
      const allCategories = await listCategories();
      setCategories(allCategories);
      setMissing(missingCategories);
      setPendingText(text);
      setDecisions(
        Object.fromEntries(missingCategories.map((m) => [m.key, { action: "create" as const }]))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setAnalyzing(false);
    }
  }

  async function doCommit(text: string, categoryDecisions?: Map<string, CategoryImportDecision>) {
    setLoading(true);
    setError(null);
    try {
      const data = await restoreFromNolioExport(text, categoryDecisions);
      setResult(data);
      setMissing(null);
      setPendingText(null);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (!pendingText) return;
    doCommit(pendingText, new Map(Object.entries(decisions)));
  }

  function handleCancelConfirm() {
    setMissing(null);
    setPendingText(null);
    setDecisions({});
  }

  if (missing && pendingText) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-600">
          設定にないカテゴリの扱いを確認
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          このファイルには、現在の設定にないカテゴリが{missing.length}件含まれています。カテゴリごとに、新規カテゴリとして追加するか、既存の別のカテゴリに変換して取り込むかを選択してください。
        </p>
        <div className="mb-4 flex flex-col gap-3">
          {missing.map((m) => {
            const decision = decisions[m.key] ?? { action: "create" as const };
            const candidates = categories.filter((c) => c.type === m.type);
            const mapTargetId =
              decision.action === "map" ? decision.targetCategoryId : candidates[0]?.id ?? "";
            return (
              <div key={m.key} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    {TYPE_LABELS[m.type] ?? m.type}
                  </span>
                  <span className="font-medium text-slate-800">{m.name}</span>
                  <span className="text-xs text-slate-400">({m.count}件)</span>
                </div>
                <div className="flex flex-col gap-1.5 pl-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`decision-${m.key}`}
                      checked={decision.action === "create"}
                      onChange={() =>
                        setDecisions((prev) => ({ ...prev, [m.key]: { action: "create" } }))
                      }
                    />
                    新規カテゴリとして追加
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`decision-${m.key}`}
                      checked={decision.action === "map"}
                      disabled={candidates.length === 0}
                      onChange={() =>
                        setDecisions((prev) => ({
                          ...prev,
                          [m.key]: { action: "map", targetCategoryId: mapTargetId },
                        }))
                      }
                    />
                    既存の別のカテゴリに変換:
                    <select
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                      disabled={decision.action !== "map" || candidates.length === 0}
                      value={mapTargetId}
                      onChange={(e) =>
                        setDecisions((prev) => ({
                          ...prev,
                          [m.key]: { action: "map", targetCategoryId: e.target.value },
                        }))
                      }
                    >
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? "取り込み中..." : "この内容で取り込む"}
          </button>
          <button
            onClick={handleCancelConfirm}
            disabled={loading}
            className="rounded-lg px-4 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            キャンセル
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">データインポート</h2>
      <p className="mb-3 text-xs text-slate-400">
        「設定 → データエクスポート・インポート」の上の「データエクスポート」でダウンロードしたCSVを取り込みます。別のブラウザ・端末で使っていたデータを移行するときに使用してください。列の対応付けは不要で、口座は名称で自動的に一致（なければ新規作成）します。カテゴリが設定にない場合は、新規追加するか既存カテゴリに変換するかを取り込み前に確認します。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
          className="text-sm"
        />
        <button
          onClick={handleRestore}
          disabled={!file || analyzing || loading}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {analyzing ? "確認中..." : loading ? "取り込み中..." : "取り込む"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          取り込み完了: 新規 {result.newCount}件 / 重複スキップ {result.duplicateCount}件
          {result.errorCount > 0 && ` / 解析エラー ${result.errorCount}件`}
          {(result.accountsCreated > 0 || result.categoriesCreated > 0) && (
            <div className="mt-1 text-xs text-emerald-600">
              新規作成: 口座 {result.accountsCreated}件 / カテゴリ {result.categoriesCreated}件
            </div>
          )}
        </div>
      )}
    </div>
  );
}
