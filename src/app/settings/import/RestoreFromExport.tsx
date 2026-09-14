"use client";

import { useState } from "react";
import { decodeBuffer } from "@/lib/csv";
import { restoreFromNolioExport, RestoreResult } from "@/lib/importer";

export default function RestoreFromExport({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function handleRestore() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const text = decodeBuffer(buf, "UTF8");
      const data = await restoreFromNolioExport(text);
      setResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">データインポート</h2>
      <p className="mb-3 text-xs text-slate-400">
        「設定 → データエクスポート・インポート」の上の「データエクスポート」でダウンロードしたCSVを取り込みます。別のブラウザ・端末で使っていたデータを移行するときに使用してください。列の対応付けは不要で、口座・カテゴリは名称で自動的に一致（なければ新規作成）します。
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
          disabled={!file || loading}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "取り込み中..." : "取り込む"}
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
