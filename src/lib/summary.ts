import { db } from "./db";

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
  rows: { category_id: string | null; category_name: string | null; color: string | null; total: number }[]
): CategoryBreakdownItem[] {
  const sorted = rows
    .map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category_name ?? "未分類",
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

function whereDateClause(kind: "month" | "year", value: string) {
  return kind === "month" ? `t.date LIKE '${value}%'` : `t.date LIKE '${value}%'`;
}

export function getPeriodSummary(kind: "month" | "year", value: string): PeriodSummary {
  const dateWhere = whereDateClause(kind, value);

  const incomeTotal = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions t WHERE type = 'INCOME' AND ${dateWhere}`
      )
      .get() as { total: number }
  ).total;

  const expenseTotal = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions t WHERE type = 'EXPENSE' AND ${dateWhere}`
      )
      .get() as { total: number }
  ).total;

  const incomeRows = db
    .prepare(
      `SELECT c.id as category_id, c.name as category_name, c.color as color, SUM(t.amount) as total
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type = 'INCOME' AND ${dateWhere}
       GROUP BY t.category_id`
    )
    .all() as { category_id: string | null; category_name: string | null; color: string | null; total: number }[];

  const expenseRows = db
    .prepare(
      `SELECT c.id as category_id, c.name as category_name, c.color as color, SUM(t.amount) as total
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type = 'EXPENSE' AND ${dateWhere}
       GROUP BY t.category_id`
    )
    .all() as { category_id: string | null; category_name: string | null; color: string | null; total: number }[];

  return {
    income: incomeTotal,
    expense: Math.abs(expenseTotal),
    balance: incomeTotal + expenseTotal,
    incomeBreakdown: breakdown(incomeRows),
    expenseBreakdown: breakdown(expenseRows),
  };
}

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
  balance: number;
}

export function getMonthlyTrend(months: string[]): TrendPoint[] {
  return months.map((ym) => {
    const s = getPeriodSummary("month", ym);
    return { label: ym, income: s.income, expense: s.expense, balance: s.balance };
  });
}

export function getYearlyTrend(years: string[]): TrendPoint[] {
  return years.map((y) => {
    const s = getPeriodSummary("year", y);
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
