import Encoding from "encoding-japanese";
import Papa from "papaparse";
import { ImportMapping } from "./types";

export function decodeBuffer(
  buf: ArrayBuffer,
  encoding: "AUTO" | "UTF8" | "SJIS"
): string {
  const bytes = new Uint8Array(buf);
  let detected: Encoding.Encoding | false = encoding === "AUTO" ? false : encoding;
  if (encoding === "AUTO") {
    detected = Encoding.detect(bytes) || "UTF8";
  }
  if (detected === "UTF8" || detected === "ASCII" || detected === false) {
    let text = new TextDecoder("utf-8").decode(bytes);
    // strip BOM
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text;
  }
  // Treat everything else (SJIS, EUCJP, JIS, etc.) via encoding-japanese conversion
  const unicodeArray = Encoding.convert(bytes, {
    to: "UNICODE",
    from: detected,
    type: "arraybuffer",
  });
  return Encoding.codeToString(unicodeArray);
}

export interface ParsedCsv {
  rows: string[][];
  rowCount: number;
}

export function parseCsvText(text: string, delimiter = ","): ParsedCsv {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: true,
  });
  const rows = (result.data as string[][]).filter(
    (r) => r.length > 0 && r.some((c) => c !== undefined && c !== "")
  );
  return { rows, rowCount: rows.length };
}

const HEADER_HINTS = {
  date: ["日付", "取引日", "年月日", "ご利用日", "利用日"],
  description: ["摘要", "内容", "お取引内容", "ご利用先", "利用先", "適用", "取引内容"],
  amount: ["金額", "取引金額", "ご利用金額", "利用金額"],
  income: ["入金", "お預入", "預入", "入金金額"],
  expense: ["出金", "お引出", "引出", "支払金額", "出金金額"],
  memo: ["備考", "メモ"],
};

function findColumn(header: string[], hints: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] || "").trim();
    if (hints.some((hint) => h.includes(hint))) return i;
  }
  return -1;
}

/**
 * Real-world bank/card CSVs often have a few preamble rows (account summary,
 * billing totals, etc.) before the actual transaction table starts. Scan the
 * first rows for the one that looks most like a header row (matches both a
 * date-ish and an amount-ish or description-ish hint) instead of assuming
 * row 0 is always it.
 */
export function guessHeaderRowIndex(rows: string[][], maxScan = 30): number {
  let bestIndex = 0;
  let bestScore = -1;
  const limit = Math.min(rows.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    const hasDate = findColumn(row, HEADER_HINTS.date) >= 0;
    const hasDesc = findColumn(row, HEADER_HINTS.description) >= 0;
    const hasAmount = findColumn(row, HEADER_HINTS.amount) >= 0;
    const hasIncome = findColumn(row, HEADER_HINTS.income) >= 0;
    const hasExpense = findColumn(row, HEADER_HINTS.expense) >= 0;
    const score =
      (hasDate ? 1 : 0) +
      (hasDesc ? 1 : 0) +
      (hasAmount ? 1 : 0) +
      (hasIncome ? 1 : 0) +
      (hasExpense ? 1 : 0);
    // require at least a date plus one more signal to count as a header row
    if (hasDate && score >= 2 && score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 0 ? bestIndex : 0;
}

export function guessMapping(
  rows: string[][],
  accountType?: "BANK" | "CREDIT_CARD"
): Partial<ImportMapping> {
  if (rows.length === 0) return {};
  const headerRowIndex = guessHeaderRowIndex(rows);
  const header = rows[headerRowIndex] ?? [];
  const dateIdx = findColumn(header, HEADER_HINTS.date);
  const descIdx = findColumn(header, HEADER_HINTS.description);
  const amountIdx = findColumn(header, HEADER_HINTS.amount);
  const incomeIdx = findColumn(header, HEADER_HINTS.income);
  const expenseIdx = findColumn(header, HEADER_HINTS.expense);
  const memoIdx = findColumn(header, HEADER_HINTS.memo);

  const mapping: Partial<ImportMapping> = {
    hasHeader: true,
    skipRows: headerRowIndex,
  };
  if (dateIdx >= 0) mapping.dateColumnIndex = dateIdx;
  if (descIdx >= 0) mapping.descriptionColumnIndex = descIdx;
  if (memoIdx >= 0 && memoIdx !== descIdx) mapping.memoColumnIndex = memoIdx;
  if (incomeIdx >= 0 && expenseIdx >= 0) {
    mapping.amountMode = "DUAL_COLUMN";
    mapping.incomeColumnIndex = incomeIdx;
    mapping.expenseColumnIndex = expenseIdx;
  } else if (amountIdx >= 0) {
    // Credit-card CSVs almost always list usage amounts unsigned, meaning "charged".
    mapping.amountMode =
      accountType === "CREDIT_CARD" ? "UNSIGNED_EXPENSE_SINGLE" : "SIGNED_SINGLE";
    mapping.amountColumnIndex = amountIdx;
  }
  return mapping;
}

const DATE_FORMATS: { pattern: RegExp; parse: (m: RegExpMatchArray) => string }[] = [
  {
    // 2026/08/10 or 2026-08-10 or 2026.08.10
    pattern: /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/,
    parse: (m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`,
  },
  {
    // 2026年8月10日
    pattern: /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?$/,
    parse: (m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`,
  },
  {
    // 20260810
    pattern: /^(\d{4})(\d{2})(\d{2})$/,
    parse: (m) => `${m[1]}-${m[2]}-${m[3]}`,
  },
  {
    // 08/10/2026 (MM/DD/YYYY) - lower priority, only if first attempts fail
    pattern: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    parse: (m) => `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
  },
  {
    // 260810 → credit-card style YYMMDD, assumed 20YY
    pattern: /^(\d{2})(\d{2})(\d{2})$/,
    parse: (m) => `20${m[1]}-${m[2]}-${m[3]}`,
  },
];

export function parseDateFlexible(raw: string): string | null {
  const s = raw.trim();
  for (const fmt of DATE_FORMATS) {
    const m = s.match(fmt.pattern);
    if (!m) continue;
    const parsed = fmt.parse(m);
    const [, mm, dd] = parsed.split("-").map(Number);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) continue;
    return parsed;
  }
  return null;
}

export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === "" || s === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[¥￥円,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}

export interface ParsedRow {
  date: string;
  rawDescription: string;
  amount: number;
  memo: string | null;
  rawRow: string[];
}

export interface RowError {
  rowIndex: number;
  reason: string;
  rawRow: string[];
}

export function buildRows(
  rows: string[][],
  mapping: ImportMapping
): { parsed: ParsedRow[]; errors: RowError[] } {
  const fromSkip = rows.slice(mapping.skipRows ?? 0);
  const dataRows = mapping.hasHeader ? fromSkip.slice(1) : fromSkip;
  const parsed: ParsedRow[] = [];
  const errors: RowError[] = [];

  dataRows.forEach((row, idx) => {
    const dateRaw = row[mapping.dateColumnIndex];
    const date = dateRaw ? parseDateFlexible(dateRaw) : null;
    if (!date) {
      errors.push({ rowIndex: idx, reason: "日付を解析できません", rawRow: row });
      return;
    }

    let description = (row[mapping.descriptionColumnIndex] || "").trim();
    if (
      mapping.descriptionColumnIndex2 != null &&
      row[mapping.descriptionColumnIndex2]
    ) {
      description = `${description} ${row[mapping.descriptionColumnIndex2].trim()}`.trim();
    }
    if (!description) {
      errors.push({ rowIndex: idx, reason: "摘要が空です", rawRow: row });
      return;
    }

    let amount: number | null = null;
    if (mapping.amountMode === "DUAL_COLUMN") {
      const income = parseAmount(row[mapping.incomeColumnIndex ?? -1] ?? "");
      const expense = parseAmount(row[mapping.expenseColumnIndex ?? -1] ?? "");
      if (income != null && income !== 0) amount = Math.abs(income);
      else if (expense != null && expense !== 0) amount = -Math.abs(expense);
      else amount = 0;
    } else {
      const raw = parseAmount(row[mapping.amountColumnIndex ?? -1] ?? "");
      if (raw == null) {
        errors.push({ rowIndex: idx, reason: "金額を解析できません", rawRow: row });
        return;
      }
      if (mapping.amountMode === "SIGNED_SINGLE") amount = raw;
      else if (mapping.amountMode === "UNSIGNED_EXPENSE_SINGLE")
        amount = -Math.abs(raw);
      else if (mapping.amountMode === "UNSIGNED_INCOME_SINGLE")
        amount = Math.abs(raw);
    }

    if (amount == null) {
      errors.push({ rowIndex: idx, reason: "金額を解析できません", rawRow: row });
      return;
    }

    const memo =
      mapping.memoColumnIndex != null
        ? (row[mapping.memoColumnIndex] || "").trim() || null
        : null;

    parsed.push({ date, rawDescription: description, amount, memo, rawRow: row });
  });

  return { parsed, errors };
}

/**
 * A unique key for duplicate detection. Doesn't need to be cryptographic —
 * just a stable, collision-free identity for "this exact CSV row".
 */
export function dedupeHash(
  date: string,
  rawDescription: string,
  amount: number,
  rawRow: string[]
): string {
  return [date, rawDescription, String(amount), rawRow.join("")].join("");
}
