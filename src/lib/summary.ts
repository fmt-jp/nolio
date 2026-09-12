import { getDb } from "./idbClient";
import { Category, Transaction } from "./types";

export interface CategoryBreakdownItem {
  categoryId: string | null;
  categoryName: string;
  color: string | null;
  amount: number;
  ratio: number;
}

export interface PeriodSummary {
  income: number;
  expense: number;
  balance: number;
  incomeBreakdown: CategoryBreakdownItem[];
  expenseBreakdown: CategoryBreakdownItem[];
}

const MAX_BREAKDOWN_ITEMS = 6;

function breakdown(
  rows: { categoryId: string | null; categoryName: string | null; color: string | null; total: number }[]
): CategoryBreakdownItem[] {
  const sorted = rows
    .map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName ?? "未分類",
      color: r.color,
      amount: Math.abs(r.total),
    }))
    .sort((a, b) => b.amount - a.amount);

  const total = sorted.reduce((s, r) => s + r.amount, 0);

  let items = sorted;
  if (sorted.length > MAX_BREAKDOWN_ITEMS) {
    const head = sorted.slice(0, MAX_BREAKDOWN_ITEMS - 1);
    const restAmount = sorted
      .slice(MAX_BREAKDOWN_ITEMS - 1)
      .reduce((s, r) => s + r.amount, 0);
    items = [
      ...head,
      { categoryId: null, categoryName: "その他", color: "#9ca3af", amount: restAmount },
    ];
  }

  return items.map((i) => ({
    ...i,
    ratio: total > 0 ? i.amount / total : 0,
  }));
}

function groupByCategory(
  txs: Transaction[],
  categoryMap: Map<string, Category>
): { categoryId: string | null; categoryName: string | null; color: string | null; total: number }[] {
  const map = new Map<string | null, number>();
  for (const t of txs) {
    map.set(t.category_id, (map.get(t.category_id) ?? 0) + t.amount);
  }
  return [...map.entries()].map(([categoryId, total]) => {
    const cat = categoryId ? categoryMap.get(categoryId) : undefined;
    return {
      categoryId,
      categoryName: cat?.name ?? null,
      color: cat?.color ?? null,
      total,
    };
  });
}

function summarizeTransactions(
  transactions: Transaction[],
  categories: Category[],
  datePrefix: string
): PeriodSummary {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const filtered = transactions.filter((t) => t.date.startsWith(datePrefix));

  const incomeTx = filtered.filter((t) => t.type === "INCOME");
  const expenseTx = filtered.filter((t) => t.type === "EXPENSE");
  const incomeTotal = incomeTx.reduce((s, t) => s + t.amount, 0);
  const expenseTotal = expenseTx.reduce((s, t) => s + t.amount, 0);

  return {
    income: incomeTotal,
    expense: Math.abs(expenseTotal),
    balance: incomeTotal + expenseTotal,
    incomeBreakdown: breakdown(groupByCategory(incomeTx, categoryMap)),
    expenseBreakdown: breakdown(groupByCategory(expenseTx, categoryMap)),
  };
}

async function loadContext(): Promise<{ transactions: Transaction[]; categories: Category[] }> {
  const db = await getDb();
  const [transactions, categories] = await Promise.all([
    db.getAll("transactions"),
    db.getAll("categories"),
  ]);
  return { transactions, categories };
}

export async function getPeriodSummary(
  kind: "month" | "year",
  value: string
): Promise<PeriodSummary> {
  void kind;
  const { transactions, categories } = await loadContext();
  return summarizeTransactions(transactions, categories, value);
}

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
  balance: number;
}

export async function getMonthlyTrend(months: string[]): Promise<TrendPoint[]> {
  const { transactions, categories } = await loadContext();
  return months.map((ym) => {
    const s = summarizeTransactions(transactions, categories, ym);
    return { label: ym, income: s.income, expense: s.expense, balance: s.balance };
  });
}

export async function getYearlyTrend(years: string[]): Promise<TrendPoint[]> {
  const { transactions, categories } = await loadContext();
  return years.map((y) => {
    const s = summarizeTransactions(transactions, categories, y);
    return { label: y, income: s.income, expense: s.expense, balance: s.balance };
  });
}

export function lastNMonths(n: number, endYearMonth?: string): string[] {
  const end = endYearMonth ? new Date(`${endYearMonth}-01T00:00:00`) : new Date();
  const result: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push(ym);
  }
  return result;
}
