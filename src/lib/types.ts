export type AccountType = "BANK" | "CREDIT_CARD";
export type TxType = "INCOME" | "EXPENSE" | "TRANSFER";
export type MatchType = "CONTAINS" | "EXACT" | "REGEX";
export type AmountMode =
  | "SIGNED_SINGLE"
  | "UNSIGNED_EXPENSE_SINGLE"
  | "UNSIGNED_INCOME_SINGLE"
  | "DUAL_COLUMN";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  payment_keyword: string | null;
  import_config: string | null;
  sort_order: number;
  created_at: string;
}

export interface ImportMapping {
  encoding: "AUTO" | "UTF8" | "SJIS";
  /** Rows to discard from the very top of the file before the header/data begins
   * (e.g. card summary info printed above the transaction table). */
  skipRows: number;
  hasHeader: boolean;
  delimiter: string;
  dateColumnIndex: number;
  descriptionColumnIndex: number;
  descriptionColumnIndex2?: number | null;
  amountMode: AmountMode;
  amountColumnIndex?: number | null;
  incomeColumnIndex?: number | null;
  expenseColumnIndex?: number | null;
  memoColumnIndex?: number | null;
}

export interface Category {
  id: string;
  name: string;
  type: TxType;
  sort_order: number;
  color: string | null;
  is_system: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  import_batch_id: string | null;
  date: string;
  raw_description: string;
  normalized_name: string;
  category_id: string | null;
  type: TxType;
  amount: number;
  memo: string | null;
  raw_row: string | null;
  dedupe_hash: string;
  is_manual_category: number;
  is_manual_name: number;
  created_at: string;
  updated_at: string;
}

export interface NormalizationRule {
  id: string;
  match_type: "CONTAINS" | "REGEX";
  pattern: string;
  replacement: string;
  priority: number;
  enabled: number;
  created_at: string;
}

export interface CategoryRule {
  id: string;
  match_type: MatchType;
  pattern: string;
  category_id: string;
  priority: number;
  enabled: number;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  account_id: string;
  file_name: string | null;
  imported_at: string;
  row_count: number;
  new_count: number;
  duplicate_count: number;
}
