export function formatYen(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}¥${Math.abs(Math.round(amount)).toLocaleString("ja-JP")}`;
}

export function formatSignedYen(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}¥${Math.abs(Math.round(amount)).toLocaleString("ja-JP")}`;
}

export function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  return `${y}年${Number(m)}月`;
}

export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${y}/${m}/${d}`;
}

export function typeLabel(type: "INCOME" | "EXPENSE" | "TRANSFER"): string {
  return type === "INCOME" ? "収入" : type === "EXPENSE" ? "支出" : "資金移動";
}

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface Delta {
  /** Percent change vs. base; null when base is 0 and current isn't (change is undefined, not "0%"). */
  pct: number | null;
  direction: "up" | "down" | "flat";
}

export function computeDelta(current: number, base: number): Delta {
  if (current === base) return { pct: 0, direction: "flat" };
  if (base === 0) return { pct: null, direction: current > base ? "up" : "down" };
  return { pct: ((current - base) / Math.abs(base)) * 100, direction: current > base ? "up" : "down" };
}
