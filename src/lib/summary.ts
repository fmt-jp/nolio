import { getDb } from "./idbClient";
import { shiftYearMonth } from "./format";
import { Category, Transaction, TxType } from "./types";

export interface CategoryBreakdownItem {
  categoryId: string | null;
  categoryName: string;
  color: string | null;
  amount: number;
  ratio: number;
  /** Same category's amount in the previous period (previous month/year). */
  previousAmount: number;
  /** Same category's average amount over the trend chart's window (12 months / 5 years). */
  averageAmount: number;
}

export interface MerchantBreakdownItem {
  name: string;
  count: number;
  amount: number;
  ratio: number;
}

export interface PeriodComparisonValues {
  income: number;
  expense: number;
  balance: number;
}

export interface PeriodSummary {
  income: number;
  expense: number;
  balance: number;
  incomeBreakdown: CategoryBreakdownItem[];
  expenseBreakdown: CategoryBreakdownItem[];
  incomeMerchants: MerchantBreakdownItem[];
  expenseMerchants: MerchantBreakdownItem[];
  /** Same period one unit back (previous month, or previous year). */
  previousPeriod: PeriodComparisonValues;
  /** Average over the same trailing window shown in the trend chart (12 months, or 5 years), current period included. */
  periodAverage: PeriodComparisonValues;
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
      { categoryId: null, categoryName: "その他のカテゴリ", color: "#9ca3af", amount: restAmount },
    ];
  }

  // previousAmount/averageAmount are filled in afterward by withCategoryComparisons;
  // this function doesn't have the other periods' data to compute them itself.
  return items.map((i) => ({
    ...i,
    ratio: total > 0 ? i.amount / total : 0,
    previousAmount: 0,
    averageAmount: 0,
  }));
}

function categoryTotalsByType(
  transactions: Transaction[],
  datePrefix: string,
  type: TxType,
  accountId?: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== type) continue;
    if (!t.date.startsWith(datePrefix)) continue;
    if (accountId && t.account_id !== accountId) continue;
    const key = t.category_id ?? "";
    map.set(key, (map.get(key) ?? 0) + Math.abs(t.amount));
  }
  return map;
}

/**
 * Fills in each breakdown item's previousAmount/averageAmount by category id.
 * The collapsed "その他のカテゴリ" row (categoryId: null) sums every category
 * NOT individually shown in `items`, so it stays an apples-to-apples "everything
 * else" comparison across periods even though which categories get collapsed
 * can differ period to period.
 */
function withCategoryComparisons(
  items: CategoryBreakdownItem[],
  previousTotals: Map<string, number>,
  windowTotalsList: Map<string, number>[]
): CategoryBreakdownItem[] {
  const headIds = items.filter((i) => i.categoryId !== null).map((i) => i.categoryId as string);
  const n = windowTotalsList.length || 1;
  const sumExcludingHead = (m: Map<string, number>) =>
    [...m.entries()].reduce((s, [k, v]) => (headIds.includes(k) ? s : s + v), 0);

  return items.map((item) => {
    if (item.categoryId !== null) {
      const previousAmount = previousTotals.get(item.categoryId) ?? 0;
      const averageAmount =
        windowTotalsList.reduce((s, m) => s + (m.get(item.categoryId as string) ?? 0), 0) / n;
      return { ...item, previousAmount, averageAmount };
    }
    const previousAmount = sumExcludingHead(previousTotals);
    const averageAmount = windowTotalsList.reduce((s, m) => s + sumExcludingHead(m), 0) / n;
    return { ...item, previousAmount, averageAmount };
  });
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

/** Ranks transactions by their aggregation name (集計名称) — "which merchant/payee did this money go to or come from". */
function merchantBreakdown(txs: Transaction[]): MerchantBreakdownItem[] {
  const map = new Map<string, { count: number; amount: number }>();
  for (const t of txs) {
    const key = t.normalized_name || t.raw_description;
    const cur = map.get(key) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Math.abs(t.amount);
    map.set(key, cur);
  }
  const items = [...map.entries()]
    .map(([name, v]) => ({ name, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);
  const total = items.reduce((s, i) => s + i.amount, 0);
  return items.map((i) => ({ ...i, ratio: total > 0 ? i.amount / total : 0 }));
}

/** Just the totals — used for comparison periods, where breakdowns/merchant rankings aren't needed. */
function summarizeTotals(
  transactions: Transaction[],
  datePrefix: string,
  accountId?: string
): PeriodComparisonValues {
  const filtered = transactions.filter(
    (t) => t.date.startsWith(datePrefix) && (!accountId || t.account_id === accountId)
  );
  const incomeTotal = filtered
    .filter((t) => t.type === "INCOME")
    .reduce((s, t) => s + t.amount, 0);
  const expenseTotal = filtered
    .filter((t) => t.type === "EXPENSE")
    .reduce((s, t) => s + t.amount, 0);
  return {
    income: incomeTotal,
    expense: Math.abs(expenseTotal),
    balance: incomeTotal + expenseTotal,
  };
}

function averageComparisonValues(values: PeriodComparisonValues[]): PeriodComparisonValues {
  const n = values.length || 1;
  return {
    income: values.reduce((s, v) => s + v.income, 0) / n,
    expense: values.reduce((s, v) => s + v.expense, 0) / n,
    balance: values.reduce((s, v) => s + v.balance, 0) / n,
  };
}

function summarizeTransactions(
  transactions: Transaction[],
  categories: Category[],
  datePrefix: string,
  accountId?: string
): Omit<PeriodSummary, "previousPeriod" | "periodAverage"> {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const filtered = transactions.filter(
    (t) => t.date.startsWith(datePrefix) && (!accountId || t.account_id === accountId)
  );

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
    incomeMerchants: merchantBreakdown(incomeTx),
    expenseMerchants: merchantBreakdown(expenseTx),
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
  value: string,
  accountId?: string
): Promise<PeriodSummary> {
  const { transactions, categories } = await loadContext();
  const current = summarizeTransactions(transactions, categories, value, accountId);

  const previousValue = kind === "month" ? shiftYearMonth(value, -1) : String(Number(value) - 1);
  const previousPeriod = summarizeTotals(transactions, previousValue, accountId);

  const window = kind === "month" ? lastNMonths(12, value) : lastNYears(5, value);
  const periodAverage = averageComparisonValues(
    window.map((v) => summarizeTotals(transactions, v, accountId))
  );

  const incomeBreakdown = withCategoryComparisons(
    current.incomeBreakdown,
    categoryTotalsByType(transactions, previousValue, "INCOME", accountId),
    window.map((v) => categoryTotalsByType(transactions, v, "INCOME", accountId))
  );
  const expenseBreakdown = withCategoryComparisons(
    current.expenseBreakdown,
    categoryTotalsByType(transactions, previousValue, "EXPENSE", accountId),
    window.map((v) => categoryTotalsByType(transactions, v, "EXPENSE", accountId))
  );

  return { ...current, incomeBreakdown, expenseBreakdown, previousPeriod, periodAverage };
}

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
  balance: number;
}

export async function getMonthlyTrend(
  months: string[],
  accountId?: string
): Promise<TrendPoint[]> {
  const { transactions, categories } = await loadContext();
  return months.map((ym) => {
    const s = summarizeTransactions(transactions, categories, ym, accountId);
    return { label: ym, income: s.income, expense: s.expense, balance: s.balance };
  });
}

export async function getYearlyTrend(
  years: string[],
  accountId?: string
): Promise<TrendPoint[]> {
  const { transactions, categories } = await loadContext();
  return years.map((y) => {
    const s = summarizeTransactions(transactions, categories, y, accountId);
    return { label: y, income: s.income, expense: s.expense, balance: s.balance };
  });
}

/**
 * Merchant ranking scoped to a single category within the カテゴリ別内訳's
 * clicked period — used to drill from a category into "which payees make up
 * this amount". `categoryId: null` means the breakdown's collapsed "その他の
 * カテゴリ" bucket (deliberately distinct from an actual category the user
 * may have named "その他"), so it aggregates every category NOT in
 * `headCategoryIds` (the categories already shown individually in that
 * breakdown).
 */
export async function getCategoryMerchants(
  datePrefix: string,
  type: TxType,
  categoryId: string | null,
  headCategoryIds: string[],
  accountId?: string
): Promise<MerchantBreakdownItem[]> {
  const { transactions } = await loadContext();
  const filtered = transactions.filter((t) => {
    if (!t.date.startsWith(datePrefix)) return false;
    if (t.type !== type) return false;
    if (accountId && t.account_id !== accountId) return false;
    if (categoryId !== null) return t.category_id === categoryId;
    return !headCategoryIds.includes(t.category_id ?? "");
  });
  return merchantBreakdown(filtered);
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

export function lastNYears(n: number, endYear?: string): string[] {
  const end = endYear ? Number(endYear) : new Date().getFullYear();
  const result: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    result.push(String(end - i));
  }
  return result;
}
