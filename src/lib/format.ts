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
