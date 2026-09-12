"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MonthSwitcher from "@/components/MonthSwitcher";
import TrendBarChart from "@/components/charts/TrendBarChart";
import CategoryPieChart from "@/components/charts/CategoryPieChart";
import { currentYearMonth, formatSignedYen, formatYen } from "@/lib/format";
import { getPeriodSummary, lastNMonths, getMonthlyTrend, PeriodSummary, TrendPoint } from "@/lib/summary";
import { getMeta } from "@/lib/repo";

export default function DashboardPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAnyData, setHasAnyData] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getPeriodSummary("month", yearMonth),
      getMonthlyTrend(lastNMonths(6, yearMonth)),
      getMeta(),
    ]).then(([summaryRes, trendPoints, metaRes]) => {
      if (cancelled) return;
      setSummary(summaryRes);
      setTrend(trendPoints);
      setHasAnyData(metaRes.months.length > 0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [yearMonth]);

  if (hasAnyData === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-lg font-semibold text-slate-700">
          まだ明細が取り込まれていません
        </p>
        <p className="text-sm text-slate-500">
          設定画面から銀行口座・クレジットカードのCSV明細を取り込むと、
          <br />
          収支の状況がここに表示されます。
        </p>
        <Link
          href="/settings/import"
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          明細を取り込む
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-xl font-bold">ダッシュボード</h1>
        <MonthSwitcher yearMonth={yearMonth} onChange={setYearMonth} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="収入" value={summary?.income ?? 0} tone="income" />
        <SummaryCard label="支出" value={summary?.expense ?? 0} tone="expense" />
        <SummaryCard
          label="収支"
          value={summary?.balance ?? 0}
          tone="balance"
          signed
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">
          月別収支推移（直近6か月）
          <span className="ml-2 font-normal text-slate-400">
            （棒をクリックするとその月を表示）
          </span>
        </h2>
        {loading ? (
          <ChartSkeleton />
        ) : (
          <TrendBarChart points={trend} selectedLabel={yearMonth} onSelect={setYearMonth} />
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">支出内訳</h2>
        {loading ? (
          <ChartSkeleton />
        ) : (
          <CategoryPieChart data={summary?.expenseBreakdown ?? []} />
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  signed,
}: {
  label: string;
  value: number;
  tone: "income" | "expense" | "balance";
  signed?: boolean;
}) {
  const toneClass =
    tone === "income"
      ? "text-blue-600"
      : tone === "expense"
      ? "text-orange-600"
      : value >= 0
      ? "text-emerald-600"
      : "text-red-600";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>
        {signed ? formatSignedYen(value) : formatYen(value)}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-slate-400">
      読み込み中...
    </div>
  );
}
