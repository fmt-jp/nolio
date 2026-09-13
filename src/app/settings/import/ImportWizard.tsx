"use client";

import { useEffect, useState } from "react";
import { decodeBuffer, guessMapping, parseCsvText, RowError } from "@/lib/csv";
import { CommitResult, commitImport } from "@/lib/importer";
import { getAccount } from "@/lib/repo";
import { Account, AmountMode, ImportMapping } from "@/lib/types";

interface PreviewData {
  rows: string[][];
  sampleRows: string[][];
  columnCount: number;
  rowCount: number;
  suggestedMapping: Partial<ImportMapping>;
  hasSavedMapping: boolean;
}

const AMOUNT_MODE_LABELS: Record<AmountMode, string> = {
  SIGNED_SINGLE: "1列（符号あり。マイナスが支出）",
  UNSIGNED_EXPENSE_SINGLE: "1列（符号なし・すべて支出扱い）",
  UNSIGNED_INCOME_SINGLE: "1列（符号なし・すべて収入扱い）",
  DUAL_COLUMN: "2列（入金列・出金列が分かれている）",
};

export default function ImportWizard({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  useEffect(() => {
    if (accounts.length === 0) return;
    if (!accountId || !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState<"AUTO" | "UTF8" | "SJIS">("AUTO");
  const [delimiter, setDelimiter] = useState(",");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);

  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const MAX_SIZE = 8 * 1024 * 1024; // 8MB

  async function buildPreviewData(): Promise<{ data: PreviewData; mapping: ImportMapping }> {
    if (!file || !accountId) throw new Error("口座とファイルを選択してください");
    if (file.size > MAX_SIZE) {
      throw new Error("ファイルサイズが大きすぎます (8MB以下)");
    }
    const buf = await file.arrayBuffer();
    const text = decodeBuffer(buf, encoding);
    const { rows, rowCount } = parseCsvText(text, delimiter);
    if (rowCount === 0) throw new Error("CSVを解析できませんでした");

    const account = await getAccount(accountId);
    let existingMapping: ImportMapping | null = null;
    if (account?.import_config) {
      try {
        existingMapping = JSON.parse(account.import_config);
      } catch {
        existingMapping = null;
      }
    }
    const sm = existingMapping ?? guessMapping(rows, account?.type);

    const data: PreviewData = {
      rows,
      sampleRows: rows.slice(0, 30),
      columnCount: rows.reduce((max, r) => Math.max(max, r.length), 0),
      rowCount,
      suggestedMapping: sm,
      hasSavedMapping: !!existingMapping,
    };
    const newMapping: ImportMapping = {
      encoding,
      skipRows: sm.skipRows ?? 0,
      hasHeader: sm.hasHeader ?? true,
      delimiter,
      dateColumnIndex: sm.dateColumnIndex ?? 0,
      descriptionColumnIndex: sm.descriptionColumnIndex ?? 1,
      descriptionColumnIndex2: sm.descriptionColumnIndex2 ?? null,
      amountMode: sm.amountMode ?? "SIGNED_SINGLE",
      amountColumnIndex: sm.amountColumnIndex ?? 2,
      incomeColumnIndex: sm.incomeColumnIndex ?? null,
      expenseColumnIndex: sm.expenseColumnIndex ?? null,
      memoColumnIndex: sm.memoColumnIndex ?? null,
    };
    return { data, mapping: newMapping };
  }

  async function handlePreview() {
    setLoadingPreview(true);
    setPreviewError(null);
    setResult(null);
    try {
      const { data, mapping: newMapping } = await buildPreviewData();
      setPreview(data);
      setMapping(newMapping);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "プレビューに失敗しました");
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleCommit() {
    if (!preview || !mapping || !accountId) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const data = await commitImport(accountId, preview.rows, mapping, file?.name ?? null);
      setResult(data);
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setCommitting(false);
    }
  }

  async function handleQuickImport() {
    setLoadingPreview(true);
    setPreviewError(null);
    setResult(null);
    setCommitError(null);
    try {
      const { data, mapping: newMapping } = await buildPreviewData();
      setPreview(data);
      setMapping(newMapping);
      setLoadingPreview(false);
      setCommitting(true);
      const commitResult = await commitImport(accountId, data.rows, newMapping, file?.name ?? null);
      setResult(commitResult);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setLoadingPreview(false);
      setCommitting(false);
    }
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
  const headerRow =
    mapping?.hasHeader ? preview?.sampleRows[mapping.skipRows] : undefined;

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
              disabled={!file || loadingPreview || committing}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loadingPreview && !committing ? "読み込み中..." : "プレビュー"}
            </button>
            <button
              onClick={handleQuickImport}
              disabled={!file || loadingPreview || committing}
              title="内容を確認せずに、そのまま取り込みます（口座に保存済みの列設定がある場合はそれを使用）"
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {committing ? "取り込み中..." : "プレビューせず取り込む"}
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

              <p className="text-xs text-slate-400">
                カード明細などは先頭に請求額・口座情報などの前置き行が含まれることがあります。その場合は下の「先頭のスキップ行数」で明細表が始まる行を指定してください。
              </p>

              <div className="max-h-72 overflow-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-max text-xs">
                  <tbody>
                    {preview.sampleRows.map((row, ri) => {
                      const isSkipped = ri < mapping.skipRows;
                      const isHeader = mapping.hasHeader && ri === mapping.skipRows;
                      return (
                        <tr
                          key={ri}
                          className={
                            isHeader
                              ? "bg-slate-900 font-medium text-white"
                              : isSkipped
                              ? "text-slate-300"
                              : ""
                          }
                        >
                          <td className="border-b border-slate-100 px-2 py-1 text-right text-[10px] opacity-60">
                            {ri}
                          </td>
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className="border-b border-slate-100 px-2 py-1 whitespace-nowrap"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-500">先頭のスキップ行数</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, preview.sampleRows.length - 1)}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
                    value={mapping.skipRows}
                    onChange={(e) =>
                      setMapping({ ...mapping, skipRows: Math.max(0, Number(e.target.value)) })
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mapping.hasHeader}
                    onChange={(e) => setMapping({ ...mapping, hasHeader: e.target.checked })}
                  />
                  スキップ後の1行目はヘッダー（項目名）
                </label>
              </div>

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

                <label className="text-sm">
                  <span className="mb-1 block text-slate-500">メモの列（任意）</span>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                    value={mapping.memoColumnIndex ?? ""}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        memoColumnIndex: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">なし</option>
                    {columnOptions.map((i) => (
                      <option key={i} value={i}>
                        {columnLabel(i)}
                      </option>
                    ))}
                  </select>
                </label>
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
            <div className="mt-4 flex flex-col gap-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                取り込み完了: 新規 {result.newCount}件 / 重複スキップ {result.duplicateCount}件
                {result.errorCount > 0 && ` / 解析エラー ${result.errorCount}件`}
                {result.autoOtherCount > 0 &&
                  ` / うち少額・1回限りのため「その他」に自動分類 ${result.autoOtherCount}件`}
              </div>
              {result.errors.length > 0 && mapping && (
                <ImportErrorList
                  errors={result.errors}
                  totalErrorCount={result.errorCount}
                  mapping={mapping}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ImportErrorList({
  errors,
  totalErrorCount,
  mapping,
}: {
  errors: RowError[];
  totalErrorCount: number;
  mapping: ImportMapping;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? errors : errors.slice(0, 5);
  // Rows are 0-indexed within the data section (after skipped preamble + header row).
  const offset = mapping.skipRows + (mapping.hasHeader ? 1 : 0);
  const truncated = totalErrorCount > errors.length;
  const separator = mapping.delimiter === "\t" ? " | " : ", ";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-amber-800">
          取り込めなかった行（{totalErrorCount}件{truncated ? `中 ${errors.length}件を表示` : ""}）
        </span>
        {errors.length > 5 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900"
          >
            {expanded ? "折りたたむ" : `すべて表示（${errors.length}件）`}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {visible.map((err, i) => (
          <div key={i} className="rounded border border-amber-100 bg-white px-2 py-1.5">
            <div className="text-xs font-medium text-amber-700">
              {err.rowIndex + offset + 1}行目付近: {err.reason}
            </div>
            <div className="mt-0.5 truncate font-mono text-xs text-slate-500">
              {err.rawRow.join(separator) || "(空行)"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
