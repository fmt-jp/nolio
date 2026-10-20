import { getDb } from "./idbClient";
import { Transaction } from "./types";

// ---------- Recurring expenses (subscriptions / fixed costs) ----------

export interface RecurringExpense {
  name: string;
  cadence: "MONTHLY" | "YEARLY";
  /** Median charge amount (positive yen). */
  amount: number;
  monthlyAmount: number;
  yearlyAmount: number;
  count: number;
  firstDate: string;
  lastDate: string;
  /** Still billed recently relative to the newest imported transaction. */
  active: boolean;
  categoryId: string | null;
}

/** Charges within this ratio of the median count as "the same amount". */
const AMOUNT_TOLERANCE = 0.1;
const MIN_MONTHLY_OCCURRENCES = 3;

function monthIndex(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + (m - 1);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Finds payees billed at a steady amount on a steady cadence. Deliberately
 * conservative (unclear patterns are left out rather than guessed at):
 * - monthly: >=3 charges, each in a distinct month, at least 3 consecutive
 *   months at the end of the run, and most charges within ±10% of the median.
 * - yearly: >=2 charges 350-380 days apart with (nearly) the same amount.
 */
export function detectRecurringExpenses(
  transactions: Transaction[],
  accountId?: string
): RecurringExpense[] {
  const expenses = transactions.filter(
    (t) => t.type === "EXPENSE" && (!accountId || t.account_id === accountId)
  );
  if (expenses.length === 0) return [];

  const latestDate = transactions.reduce((max, t) => (t.date > max ? t.date : max), "");
  const latestMonth = monthIndex(latestDate);

  const groups = new Map<string, Transaction[]>();
  for (const t of expenses) {
    const key = t.normalized_name || t.raw_description;
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const results: RecurringExpense[] = [];
  for (const [name, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const typical = median(amounts);
    if (typical <= 0) continue;
    const steady = sorted.filter((t) => Math.abs(Math.abs(t.amount) - typical) <= typical * AMOUNT_TOLERANCE);

    const lastDate = sorted[sorted.length - 1].date;
    const base = {
      name,
      firstDate: sorted[0].date,
      lastDate,
      categoryId: sorted[sorted.length - 1].category_id,
    };

    // Monthly: one charge per month for the trailing run of consecutive months.
    const byMonth = new Map<number, Transaction>();
    let multiplePerMonth = false;
    for (const t of steady) {
      const idx = monthIndex(t.date);
      if (byMonth.has(idx)) multiplePerMonth = true;
      byMonth.set(idx, t);
    }
    const months = [...byMonth.keys()].sort((a, b) => a - b);
    let run = 0;
    for (let i = months.length - 1; i >= 0; i--) {
      if (i === months.length - 1 || months[i + 1] - months[i] === 1) run++;
      else break;
    }
    const steadyShare = steady.length / sorted.length;
    if (!multiplePerMonth && run >= MIN_MONTHLY_OCCURRENCES && steadyShare >= 0.7) {
      const runMonths = months.slice(-run);
      const runAmounts = runMonths.map((m) => Math.abs(byMonth.get(m)!.amount));
      const amount = Math.round(median(runAmounts));
      results.push({
        ...base,
        cadence: "MONTHLY",
        amount,
        monthlyAmount: amount,
        yearlyAmount: amount * 12,
        count: run,
        firstDate: byMonth.get(runMonths[0])!.date,
        active: latestMonth - months[months.length - 1] <= 1,
      });
      continue;
    }

    // Yearly: the last two charges roughly a year apart at the same amount.
    if (sorted.length >= 2) {
      const a = sorted[sorted.length - 2];
      const b = sorted[sorted.length - 1];
      const gap = dayNumber(b.date) - dayNumber(a.date);
      const amountA = Math.abs(a.amount);
      const amountB = Math.abs(b.amount);
      if (
        gap >= 350 &&
        gap <= 380 &&
        Math.abs(amountA - amountB) <= Math.max(amountA, amountB) * AMOUNT_TOLERANCE
      ) {
        const amount = Math.round((amountA + amountB) / 2);
        results.push({
          ...base,
          cadence: "YEARLY",
          amount,
          monthlyAmount: Math.round(amount / 12),
          yearlyAmount: amount,
          count: 2,
          firstDate: a.date,
          active: dayNumber(latestDate) - dayNumber(b.date) <= 380,
        });
      }
    }
  }

  return results.sort(
    (a, b) => Number(b.active) - Number(a.active) || b.yearlyAmount - a.yearlyAmount
  );
}

export async function getRecurringExpenses(accountId?: string): Promise<RecurringExpense[]> {
  const db = await getDb();
  return detectRecurringExpenses(await db.getAll("transactions"), accountId);
}

// ---------- Spending rhythm (weekday / day-of-month) ----------

export interface DaySpending {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
}

export interface WeekdayStat {
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  total: number;
  /** Average spend per calendar day of this weekday within the period. */
  average: number;
}

export interface SpendingRhythm {
  days: DaySpending[];
  weekdays: WeekdayStat[];
  /** 上旬(1-10) / 中旬(11-20) / 下旬(21-) totals. */
  tenDays: { label: string; total: number }[];
  total: number;
  /** Number of calendar days in the period that fall on or before the newest data. */
  elapsedDays: number;
}

function daysInRange(startPrefix: string, unit: "month" | "year"): string[] {
  const out: string[] = [];
  const months =
    unit === "month"
      ? [startPrefix]
      : Array.from({ length: 12 }, (_, i) => `${startPrefix}-${String(i + 1).padStart(2, "0")}`);
  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) out.push(`${ym}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

export function computeSpendingRhythm(
  transactions: Transaction[],
  unit: "month" | "year",
  period: string,
  accountId?: string
): SpendingRhythm {
  const spendByDate = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "EXPENSE" || !t.date.startsWith(period)) continue;
    if (accountId && t.account_id !== accountId) continue;
    spendByDate.set(t.date, (spendByDate.get(t.date) ?? 0) + Math.abs(t.amount));
  }

  const latestDate = transactions.reduce((max, t) => (t.date > max ? t.date : max), "");
  const calendar = daysInRange(period, unit);
  const elapsed = calendar.filter((d) => d <= latestDate);

  const days = calendar.map((date) => ({ date, amount: spendByDate.get(date) ?? 0 }));

  const totals = new Array<number>(7).fill(0);
  const dayCounts = new Array<number>(7).fill(0);
  for (const date of elapsed) {
    const [y, m, d] = date.split("-").map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    totals[wd] += spendByDate.get(date) ?? 0;
    dayCounts[wd] += 1;
  }
  const weekdays = totals.map((total, weekday) => ({
    weekday,
    total,
    average: dayCounts[weekday] > 0 ? total / dayCounts[weekday] : 0,
  }));

  const ten = [0, 0, 0];
  for (const { date, amount } of days) {
    const d = Number(date.slice(8, 10));
    ten[d <= 10 ? 0 : d <= 20 ? 1 : 2] += amount;
  }

  return {
    days,
    weekdays,
    tenDays: [
      { label: "上旬 (1-10日)", total: ten[0] },
      { label: "中旬 (11-20日)", total: ten[1] },
      { label: "下旬 (21日-)", total: ten[2] },
    ],
    total: ten[0] + ten[1] + ten[2],
    elapsedDays: elapsed.length,
  };
}

export async function getSpendingRhythm(
  unit: "month" | "year",
  period: string,
  accountId?: string
): Promise<SpendingRhythm> {
  const db = await getDb();
  return computeSpendingRhythm(await db.getAll("transactions"), unit, period, accountId);
}
