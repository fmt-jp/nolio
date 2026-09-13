"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import MonthSwitcher from "@/components/MonthSwitcher";
import TrendBarChart from "@/components/charts/TrendBarChart";
import CategoryPieChart from "@/components/charts/CategoryPieChart";
import CategoryAmountTable from "@/components/CategoryAmountTable";
import MerchantRankingList from "@/components/MerchantRankingList";
import { currentYearMonth, formatSignedYen, formatYen } from "@/lib/format";
import {
  getMonthlyTrend,
  getPeriodSummary,
  getYearlyTrend,
  lastNMonths,
  PeriodSummary,
  TrendPoint,
} from "@/lib/summary";
import { getDistinctYears, listAccounts } from "@/lib/repo";
import { Account } from "@/lib/types";

type Unit = "month" | "year";

export default function AnalysisPage() {
  const [unit, setUnit] = useState<Unit>("month");
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [breakdownType, setBreakdownType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAccounts().then(setAccounts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const period = unit === "month" ? yearMonth : year;
    const filterAccountId = accountId || undefined;

    async function load() {
      const summaryPromise = getPeriodSummary(unit, period, filterAccountId);
      const trendPromise =
        unit === "month"
          ? getMonthlyTrend(lastNMonths(12, yearMonth), filterAccountId)
          : (async () => {
              const currentYear = String(new Date().getFullYear());
              const allYears = await getDistinctYears();
              const years = [...new Set([...allYears, currentYear])].sort();
              return getYearlyTrend(years.slice(-5), filterAccountId);
            })();

      const [summaryRes, trendPoints] = await Promise.all([summaryPromise, trendPromise]);
      if (cancelled) return;
      setSummary(summaryRes);
      setTrend(trendPoints);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [unit, yearMonth, year, accountId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-xl font-bold">分析</h1>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">すべての口座</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.type === "BANK" ? "🏦" : "💳"} {a.name}
              </option>
            ))}
          </select>
          <div className="flex rounded-full border border-slate-200 bg-white p-1 text-sm">
            <button
              className={clsx(
                "rounded-full px-4 py-1",
                unit === "month" ? "bg-slate-900 text-white" : "text-slate-500"
              )}
              onClick={() => setUnit("month")}
            >
              月別
            </button>
            <button
              className={clsx(
                "rounded-full px-4 py-1",
                unit === "year" ? "bg-slate-900 text-white" : "text-slate-500"
              )}
              onClick={() => setUnit("year")}
            >
              年別
            </button>
          </div>
          {unit === "month" ? (
            <MonthSwitcher yearMonth={yearMonth} onChange={setYearMonth} />
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setYear(String(Number(year) - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                ‹
              </button>
              <div className="min-w-20 text-center text-lg font-semibold">{year}年</div>
              <button
                onClick={() => setYear(String(Number(year) + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="収入" value={summary?.income ?? 0} tone="income" />
        <SummaryCard label="支出" value={summary?.expense ?? 0} tone="expense" />
        <SummaryCard label="収支" value={summary?.balance ?? 0} tone="balance" signed />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">
          {unit === "month" ? "月別推移（直近12か月）" : "年別推移（直近5年）"}
          <span className="ml-2 font-normal text-slate-400">
            （棒をクリックするとその{unit === "month" ? "月" : "年"}を表示）
          </span>
        </h2>
        {loading ? (
          <ChartSkeleton />
        ) : (
          <TrendBarChart
            points={trend}
            selectedLabel={unit === "month" ? yearMonth : year}
            onSelect={(label) => (unit === "month" ? setYearMonth(label) : setYear(label))}
          />
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600">カテゴリ別内訳</h2>
          <div className="flex rounded-full border border-slate-200 p-0.5 text-xs">
            <button
              className={clsx(
                "rounded-full px-3 py-1",
                breakdownType === "EXPENSE" ? "bg-slate-900 text-white" : "text-slate-500"
              )}
              onClick={() => setBreakdownType("EXPENSE")}
            >
              支出
            </button>
            <button
              className={clsx(
                "rounded-full px-3 py-1",
                breakdownType === "INCOME" ? "bg-slate-900 text-white" : "text-slate-500"
              )}
              onClick={() => setBreakdownType("INCOME")}
            >
              収入
            </button>
          </div>
        </div>
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CategoryPieChart
              data={
                breakdownType === "EXPENSE"
                  ? summary?.expenseBreakdown ?? []
                  : summary?.incomeBreakdown ?? []
              }
            />
            <CategoryAmountTable
              items={
                breakdownType === "EXPENSE"
                  ? summary?.expenseBreakdown ?? []
                  : summary?.incomeBreakdown ?? []
              }
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">
          摘要・支払先・利用先別ランキング（{breakdownType === "EXPENSE" ? "支出" : "収入"}）
        </h2>
        {loading ? (
          <ChartSkeleton />
        ) : (
          <MerchantRankingList
            items={
              breakdownType === "EXPENSE"
                ? summary?.expenseMerchants ?? []
                : summary?.incomeMerchants ?? []
            }
          />
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
