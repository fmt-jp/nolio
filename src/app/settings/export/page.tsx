"use client";

export default function ExportSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">データエクスポート</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-4 text-sm text-slate-500">
          取り込んだすべての明細（元明細・集計名称・カテゴリ・取引種別・金額を含む）をCSVファイルとしてダウンロードできます。
        </p>
        <a
          href="/api/export"
          className="inline-block rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          CSVをダウンロード
        </a>
      </div>
    </div>
  );
}
