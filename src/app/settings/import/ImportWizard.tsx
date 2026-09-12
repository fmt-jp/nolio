"use client";

import { useState } from "react";
import { Account, AmountMode, ImportMapping } from "@/lib/types";

interface PreviewResponse {
  csvText: string;
  sampleRows: string[][];
  columnCount: number;
  rowCount: number;
  suggestedMapping: Partial<ImportMapping>;
  hasSavedMapping: boolean;
}

interface CommitResponse {
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  totalRows: number;
}

const AMOUNT_MODE_LABELS: Record<AmountMode, string> = {
  SIGNED_SINGLE: "1列（符号あり。マイナスが支出）",
  UNSIGNED_EXPENSE_SINGLE: "1列（符号なし・すべて支出扱い）",
  UNSIGNED_INCOME_SINGLE: "1列（符号なし・すべて収入扱い）",
  DUAL_COLUMN: "2列（入金列・出金列が分かれている）",
};

export default function ImportWizard({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState<"AUTO" | "UTF8" | "SJIS">("AUTO");
  const [delimiter, setDelimiter] = useState(",");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);

  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  async function handlePreview() {
    if (!file || !accountId) return;
    setLoadingPreview(true);
    setPreviewError(null);
    setResult(null);
    const form = new FormData();
    form.set("file", file);
    form.set("accountId", accountId);
    form.set("encoding", encoding);
    form.set("delimiter", delimiter);
    const res = await fetch("/api/import/preview", { method: "POST", body: form });
    const data = await res.json();
    setLoadingPreview(false);
    if (!res.ok) {
      setPreviewError(data.error || "プレビューに失敗しました");
      setPreview(null);
      return;
    }
    setPreview(data);
    const sm = data.suggestedMapping ?? {};
    setMapping({
      encoding,
      hasHeader: sm.hasHeader ?? true,
      delimiter,
      dateColumnIndex: sm.dateColumnIndex ?? 0,
      descriptionColumnIndex: sm.descriptionColumnIndex ?? 1,
      descriptionColumnIndex2: sm.descriptionColumnIndex2 ?? null,
      amountMode: sm.amountMode ?? "SIGNED_SINGLE",
      amountColumnIndex: sm.amountColumnIndex ?? 2,
      incomeColumnIndex: sm.incomeColumnIndex ?? null,
      expenseColumnIndex: sm.expenseColumnIndex ?? null,
    });
  }

  async function handleCommit() {
    if (!preview || !mapping || !accountId) return;
    setCommitting(true);
    setCommitError(null);
    const res = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        csvText: preview.csvText,
        mapping,
        fileName: file?.name ?? null,
      }),
    });
    const data = await res.json();
    setCommitting(false);
    if (!res.ok) {
      setCommitError(data.error || "取り込みに失敗しました");
      return;
    }
    setResult(data);
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setMapping(null);
    setResult(null);
    setPreviewError(null);
    setCommitError(null);
  }

  const columnOptions = Array.from({ length: preview?.columnCount ?? 0 }, (_, i) => i);
  const headerRow = mapping?.hasHeader ? preview?.sampleRows[0] : undefined;

  function columnLabel(i: number) {
    const header = headerRow?.[i];
    return header ? `${i}: ${header}` : `列${i}`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-600">CSV取り込み</h2>

      {accounts.length === 0 ? (
        <p className="text-sm text-slate-400">
          まず上の「口座・カード管理」から口座を登録してください。
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">取り込み先口座</span>
              <select
                className="rounded-lg border border-slate-300 px-2 py-1.5"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  reset();
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type === "BANK" ? "🏦" : "💳"} {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">文字コード</span>
              <select
                className="rounded-lg border border-slate-300 px-2 py-1.5"
                value={encoding}
                onChange={(e) => setEncoding(e.target.value as "AUTO" | "UTF8" | "SJIS")}
              >
                <option value="AUTO">自動判定</option>
                <option value="UTF8">UTF-8</option>
                <option value="SJIS">Shift_JIS</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">区切り文字</span>
              <select
                className="rounded-lg border border-slate-300 px-2 py-1.5"
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
              >
                <option value=",">カンマ (,)</option>
                <option value="\t">タブ</option>
                <option value=";">セミコロン (;)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">CSVファイル</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                  setResult(null);
                }}
                className="block text-sm"
              />
            </label>
            <button
              onClick={handlePreview}
              disabled={!file || loadingPreview}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loadingPreview ? "読み込み中..." : "プレビュー"}
            </button>
          </div>
          {previewError && <p className="mb-3 text-sm text-red-600">{previewError}</p>}

          {preview && mapping && (
            <div className="flex flex-col gap-4">
              {preview.hasSavedMapping && (
                <p className="text-xs text-emerald-600">
                  この口座の前回の列設定を読み込みました。必要に応じて調整してください。
                </p>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-max text-xs">
                  <tbody>
                    {preview.sampleRows.slice(0, 6).map((row, ri) => (
                      <tr key={ri} className={ri === 0 && mapping.hasHeader ? "bg-slate-50 font-medium" : ""}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="border-b border-slate-100 px-2 py-1 whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mapping.hasHeader}
                  onChange={(e) => setMapping({ ...mapping, hasHeader: e.target.checked })}
                />
                1行目はヘッダー（項目名）
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-500">日付の列</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                    value={mapping.dateColumnIndex}
                    onChange={(e) =>
                      setMapping({ ...mapping, dateColumnIndex: Number(e.target.value) })
                    }
                  >
                    {columnOptions.map((i) => (
                      <option key={i} value={i}>
                        {columnLabel(i)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-500">摘要（明細名）の列</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                    value={mapping.descriptionColumnIndex}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        descriptionColumnIndex: Number(e.target.value),
                      })
                    }
                  >
                    {columnOptions.map((i) => (
                      <option key={i} value={i}>
                        {columnLabel(i)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-500">金額の形式</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                    value={mapping.amountMode}
                    onChange={(e) =>
                      setMapping({ ...mapping, amountMode: e.target.value as AmountMode })
                    }
                  >
                    {Object.entries(AMOUNT_MODE_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                {mapping.amountMode === "DUAL_COLUMN" ? (
                  <>
                    <label className="text-sm">
                      <span className="mb-1 block text-slate-500">入金額の列</span>
                      <select
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                        value={mapping.incomeColumnIndex ?? ""}
                        onChange={(e) =>
                          setMapping({
                            ...mapping,
                            incomeColumnIndex: Number(e.target.value),
                          })
                        }
                      >
                        {columnOptions.map((i) => (
                          <option key={i} value={i}>
                            {columnLabel(i)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-slate-500">出金額の列</span>
                      <select
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                        value={mapping.expenseColumnIndex ?? ""}
                        onChange={(e) =>
                          setMapping({
                            ...mapping,
                            expenseColumnIndex: Number(e.target.value),
                          })
                        }
                      >
                        {columnOptions.map((i) => (
                          <option key={i} value={i}>
                            {columnLabel(i)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-500">金額の列</span>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                      value={mapping.amountColumnIndex ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          amountColumnIndex: Number(e.target.value),
                        })
                      }
                    >
                      {columnOptions.map((i) => (
                        <option key={i} value={i}>
                          {columnLabel(i)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCommit}
                  disabled={committing}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {committing ? "取り込み中..." : `この内容で取り込む（全${preview.rowCount}行）`}
                </button>
                <button
                  onClick={reset}
                  className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
                >
                  やり直す
                </button>
              </div>
              {commitError && <p className="text-sm text-red-600">{commitError}</p>}
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              取り込み完了: 新規 {result.newCount}件 / 重複スキップ {result.duplicateCount}件
              {result.errorCount > 0 && ` / 解析エラー ${result.errorCount}件`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
