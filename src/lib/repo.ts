import { randomUUID } from "crypto";
import { db } from "./db";
import { ensureSeed } from "./seed";
import {
  Account,
  AccountType,
  Category,
  CategoryRule,
  ImportMapping,
  MatchType,
  NormalizationRule,
  Transaction,
  TxType,
} from "./types";

ensureSeed();

// ---------- Accounts ----------
export function listAccounts(): Account[] {
  return db
    .prepare("SELECT * FROM accounts ORDER BY sort_order ASC, created_at ASC")
    .all() as Account[];
}

export function getAccount(id: string): Account | undefined {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as
    | Account
    | undefined;
}

export function createAccount(input: {
  name: string;
  type: AccountType;
  paymentKeyword?: string | null;
}): Account {
  const id = randomUUID();
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) as m FROM accounts")
    .get() as { m: number };
  db.prepare(
    `INSERT INTO accounts (id, name, type, payment_keyword, sort_order) VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.name, input.type, input.paymentKeyword ?? null, maxOrder.m + 1);
  return getAccount(id)!;
}

export function updateAccount(
  id: string,
  input: Partial<{ name: string; paymentKeyword: string | null; importConfig: ImportMapping }>
): Account | undefined {
  const current = getAccount(id);
  if (!current) return undefined;
  db.prepare(
    `UPDATE accounts SET name = ?, payment_keyword = ?, import_config = ? WHERE id = ?`
  ).run(
    input.name ?? current.name,
    input.paymentKeyword !== undefined ? input.paymentKeyword : current.payment_keyword,
    input.importConfig ? JSON.stringify(input.importConfig) : current.import_config,
    id
  );
  return getAccount(id);
}

export function deleteAccount(id: string) {
  const count = db
    .prepare("SELECT COUNT(*) as c FROM transactions WHERE account_id = ?")
    .get(id) as { c: number };
  if (count.c > 0) {
    throw new Error("この口座には明細が存在するため削除できません");
  }
  db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
}

// ---------- Categories ----------
export function listCategories(): Category[] {
  return db
    .prepare("SELECT * FROM categories ORDER BY type ASC, sort_order ASC")
    .all() as Category[];
}

export function getCategory(id: string): Category | undefined {
  return db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as
    | Category
    | undefined;
}

export function createCategory(input: {
  name: string;
  type: TxType;
  color?: string | null;
}): Category {
  const id = randomUUID();
  const maxOrder = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) as m FROM categories WHERE type = ?"
    )
    .get(input.type) as { m: number };
  db.prepare(
    `INSERT INTO categories (id, name, type, sort_order, color, is_system) VALUES (?, ?, ?, ?, ?, 0)`
  ).run(id, input.name, input.type, maxOrder.m + 1, input.color ?? null);
  return getCategory(id)!;
}

export function updateCategory(
  id: string,
  input: Partial<{ name: string; color: string | null; sortOrder: number }>
): Category | undefined {
  const current = getCategory(id);
  if (!current) return undefined;
  db.prepare(`UPDATE categories SET name = ?, color = ?, sort_order = ? WHERE id = ?`).run(
    input.name ?? current.name,
    input.color !== undefined ? input.color : current.color,
    input.sortOrder ?? current.sort_order,
    id
  );
  return getCategory(id);
}

export function deleteCategory(id: string) {
  const current = getCategory(id);
  if (!current) return;
  if (current.is_system) throw new Error("このカテゴリは削除できません");
  const fallback = db
    .prepare(
      "SELECT id FROM categories WHERE type = ? AND is_system = 1 LIMIT 1"
    )
    .get(current.type) as { id: string } | undefined;
  const tx = db.transaction(() => {
    if (fallback) {
      db.prepare(
        "UPDATE transactions SET category_id = ? WHERE category_id = ?"
      ).run(fallback.id, id);
    }
    db.prepare("DELETE FROM category_rules WHERE category_id = ?").run(id);
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  });
  tx();
}

// ---------- Normalization rules ----------
export function listNormalizationRules(): NormalizationRule[] {
  return db
    .prepare(
      "SELECT * FROM normalization_rules ORDER BY priority DESC, created_at ASC"
    )
    .all() as NormalizationRule[];
}

export function createNormalizationRule(input: {
  matchType: "CONTAINS" | "REGEX";
  pattern: string;
  replacement: string;
  priority?: number;
}): NormalizationRule {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO normalization_rules (id, match_type, pattern, replacement, priority) VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.matchType, input.pattern, input.replacement, input.priority ?? 0);
  return db
    .prepare("SELECT * FROM normalization_rules WHERE id = ?")
    .get(id) as NormalizationRule;
}

export function updateNormalizationRule(
  id: string,
  input: Partial<{
    matchType: "CONTAINS" | "REGEX";
    pattern: string;
    replacement: string;
    priority: number;
    enabled: boolean;
  }>
) {
  const current = db
    .prepare("SELECT * FROM normalization_rules WHERE id = ?")
    .get(id) as NormalizationRule | undefined;
  if (!current) return undefined;
  db.prepare(
    `UPDATE normalization_rules SET match_type=?, pattern=?, replacement=?, priority=?, enabled=? WHERE id=?`
  ).run(
    input.matchType ?? current.match_type,
    input.pattern ?? current.pattern,
    input.replacement ?? current.replacement,
    input.priority ?? current.priority,
    input.enabled !== undefined ? (input.enabled ? 1 : 0) : current.enabled,
    id
  );
  return db.prepare("SELECT * FROM normalization_rules WHERE id = ?").get(id);
}

export function deleteNormalizationRule(id: string) {
  db.prepare("DELETE FROM normalization_rules WHERE id = ?").run(id);
}

// ---------- Category rules ----------
export function listCategoryRules(): CategoryRule[] {
  return db
    .prepare(
      "SELECT * FROM category_rules ORDER BY priority DESC, created_at ASC"
    )
    .all() as CategoryRule[];
}

export function createCategoryRule(input: {
  matchType: MatchType;
  pattern: string;
  categoryId: string;
  priority?: number;
}): CategoryRule {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO category_rules (id, match_type, pattern, category_id, priority) VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.matchType, input.pattern, input.categoryId, input.priority ?? 0);
  return db.prepare("SELECT * FROM category_rules WHERE id = ?").get(id) as CategoryRule;
}

export function updateCategoryRule(
  id: string,
  input: Partial<{
    matchType: MatchType;
    pattern: string;
    categoryId: string;
    priority: number;
    enabled: boolean;
  }>
) {
  const current = db
    .prepare("SELECT * FROM category_rules WHERE id = ?")
    .get(id) as CategoryRule | undefined;
  if (!current) return undefined;
  db.prepare(
    `UPDATE category_rules SET match_type=?, pattern=?, category_id=?, priority=?, enabled=? WHERE id=?`
  ).run(
    input.matchType ?? current.match_type,
    input.pattern ?? current.pattern,
    input.categoryId ?? current.category_id,
    input.priority ?? current.priority,
    input.enabled !== undefined ? (input.enabled ? 1 : 0) : current.enabled,
    id
  );
  return db.prepare("SELECT * FROM category_rules WHERE id = ?").get(id);
}

export function deleteCategoryRule(id: string) {
  db.prepare("DELETE FROM category_rules WHERE id = ?").run(id);
}

// ---------- Transactions ----------
export interface TransactionFilter {
  yearMonth?: string; // YYYY-MM
  year?: string; // YYYY
  accountId?: string;
  categoryId?: string;
  type?: TxType;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TransactionWithJoins extends Transaction {
  account_name: string;
  account_type: AccountType;
  category_name: string | null;
  category_color: string | null;
}

export function listTransactions(filter: TransactionFilter): {
  items: TransactionWithJoins[];
  total: number;
} {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.yearMonth) {
    clauses.push("t.date LIKE ?");
    params.push(`${filter.yearMonth}%`);
  } else if (filter.year) {
    clauses.push("t.date LIKE ?");
    params.push(`${filter.year}%`);
  }
  if (filter.accountId) {
    clauses.push("t.account_id = ?");
    params.push(filter.accountId);
  }
  if (filter.categoryId) {
    clauses.push("t.category_id = ?");
    params.push(filter.categoryId);
  }
  if (filter.type) {
    clauses.push("t.type = ?");
    params.push(filter.type);
  }
  if (filter.search) {
    clauses.push("(t.raw_description LIKE ? OR t.normalized_name LIKE ?)");
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM transactions t ${where}`)
      .get(...params) as { c: number }
  ).c;

  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const items = db
    .prepare(
      `SELECT t.*, a.name as account_name, a.type as account_type,
              c.name as category_name, c.color as category_color
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       ${where}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as TransactionWithJoins[];

  return { items, total };
}

export function updateTransaction(
  id: string,
  input: Partial<{
    categoryId: string;
    normalizedName: string;
    memo: string | null;
  }>
): Transaction | undefined {
  const current = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as
    | Transaction
    | undefined;
  if (!current) return undefined;

  let type: TxType = current.type;
  let isManualCategory = current.is_manual_category;
  let categoryId = current.category_id;
  if (input.categoryId !== undefined) {
    const cat = getCategory(input.categoryId);
    if (!cat) throw new Error("カテゴリが見つかりません");
    categoryId = cat.id;
    type = cat.type;
    isManualCategory = 1;
  }

  let isManualName = current.is_manual_name;
  let normalizedName = current.normalized_name;
  if (input.normalizedName !== undefined) {
    normalizedName = input.normalizedName;
    isManualName = 1;
  }

  const memo = input.memo !== undefined ? input.memo : current.memo;

  db.prepare(
    `UPDATE transactions SET category_id=?, type=?, normalized_name=?, memo=?, is_manual_category=?, is_manual_name=?, updated_at=datetime('now') WHERE id=?`
  ).run(categoryId, type, normalizedName, memo, isManualCategory, isManualName, id);

  return db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Transaction;
}

export function getDistinctMonths(): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT substr(date, 1, 7) as ym FROM transactions ORDER BY ym DESC`
    )
    .all() as { ym: string }[];
  return rows.map((r) => r.ym);
}

export function getDistinctYears(): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT substr(date, 1, 4) as y FROM transactions ORDER BY y DESC`
    )
    .all() as { y: string }[];
  return rows.map((r) => r.y);
}
