"use client";

import { useState } from "react";
import { getDb } from "@/lib/idbClient";
import RestoreFromExport from "../import/RestoreFromExport";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function buildExportCsv(): Promise<string> {
  const db = await getDb();
  const [transactions, accounts, categories] = await Promise.all([
    db.getAll("transactions"),
    db.getAll("accounts"),
    db.getAll("categories"),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  const header = [
    "日付",
    "口座名",
    "口座種別",
    "元明細",
    "集計名称",
    "カテゴリ",
    "取引種別",
    "金額",
    "メモ",
  ];
  const typeLabel = { INCOME: "収入", EXPENSE: "支出", TRANSFER: "資金移動" } as const;

  const lines = [header.join(",")];
  for (const t of sorted) {
    const account = accountMap.get(t.account_id);
    const category = t.category_id ? categoryMap.get(t.category_id) : undefined;
    lines.push(
      [
        t.date,
        account?.name ?? "",
        account?.type === "BANK" ? "銀行" : account?.type === "CREDIT_CARD" ? "クレジットカード" : "",
        t.raw_description,
        t.normalized_name,
        category?.name ?? "",
        typeLabel[t.type],
        t.amount,
        t.memo ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  return "﻿" + lines.join("\r\n");
}

export default function ExportSettingsPage() {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const csv = await buildExportCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nolio_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">データエクスポート・インポート</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-600">データエクスポート</h2>
        <p className="mb-4 text-sm text-slate-500">
          取り込んだすべての明細（元明細・集計名称・カテゴリ・取引種別・金額を含む）をCSVファイルとしてダウンロードできます。データはこの端末のブラウザ内にのみ保存されています。
        </p>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-block rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {downloading ? "準備中..." : "CSVをダウンロード"}
        </button>
      </div>
      <RestoreFromExport onDone={() => {}} />
    </div>
  );
}
