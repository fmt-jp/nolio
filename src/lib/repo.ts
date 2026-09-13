import { getDb } from "./idbClient";
import { uid } from "./id";
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

function nowIso(): string {
  return new Date().toISOString();
}

// ---------- Accounts ----------
export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  const all = await db.getAll("accounts");
  return all.sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  );
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const db = await getDb();
  return db.get("accounts", id);
}

export async function createAccount(input: {
  name: string;
  type: AccountType;
  paymentKeyword?: string | null;
}): Promise<Account> {
  const db = await getDb();
  const existing = await db.getAll("accounts");
  const maxOrder = existing.reduce((m, a) => Math.max(m, a.sort_order), -1);
  const account: Account = {
    id: uid(),
    name: input.name,
    type: input.type,
    payment_keyword: input.paymentKeyword ?? null,
    import_config: null,
    sort_order: maxOrder + 1,
    created_at: nowIso(),
  };
  await db.put("accounts", account);
  return account;
}

export async function updateAccount(
  id: string,
  input: Partial<{ name: string; paymentKeyword: string | null; importConfig: ImportMapping }>
): Promise<Account | undefined> {
  const db = await getDb();
  const current = await db.get("accounts", id);
  if (!current) return undefined;
  const updated: Account = {
    ...current,
    name: input.name ?? current.name,
    payment_keyword:
      input.paymentKeyword !== undefined ? input.paymentKeyword : current.payment_keyword,
    import_config: input.importConfig
      ? JSON.stringify(input.importConfig)
      : current.import_config,
  };
  await db.put("accounts", updated);
  return updated;
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  const count = await db.countFromIndex("transactions", "by_account", id);
  if (count > 0) {
    throw new Error("この口座には明細が存在するため削除できません");
  }
  await db.delete("accounts", id);
}

// ---------- Categories ----------
export async function listCategories(): Promise<Category[]> {
  await ensureSeed();
  const db = await getDb();
  const all = await db.getAll("categories");
  return all.sort(
    (a, b) => a.type.localeCompare(b.type) || a.sort_order - b.sort_order
  );
}

export async function getCategory(id: string): Promise<Category | undefined> {
  const db = await getDb();
  return db.get("categories", id);
}

export async function createCategory(input: {
  name: string;
  type: TxType;
  color?: string | null;
}): Promise<Category> {
  const db = await getDb();
  const existing = await db.getAll("categories");
  const maxOrder = existing
    .filter((c) => c.type === input.type)
    .reduce((m, c) => Math.max(m, c.sort_order), -1);
  const category: Category = {
    id: uid(),
    name: input.name,
    type: input.type,
    sort_order: maxOrder + 1,
    color: input.color ?? null,
    is_system: 0,
    created_at: nowIso(),
  };
  await db.put("categories", category);
  return category;
}

export async function updateCategory(
  id: string,
  input: Partial<{ name: string; color: string | null; sortOrder: number }>
): Promise<Category | undefined> {
  const db = await getDb();
  const current = await db.get("categories", id);
  if (!current) return undefined;
  const updated: Category = {
    ...current,
    name: input.name ?? current.name,
    color: input.color !== undefined ? input.color : current.color,
    sort_order: input.sortOrder ?? current.sort_order,
  };
  await db.put("categories", updated);
  return updated;
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  const current = await db.get("categories", id);
  if (!current) return;
  if (current.is_system) throw new Error("このカテゴリは削除できません");

  const allCategories = await db.getAll("categories");
  const fallback = allCategories.find((c) => c.type === current.type && c.is_system);

  if (fallback) {
    const affected = await db.getAllFromIndex("transactions", "by_category", id);
    const tx = db.transaction("transactions", "readwrite");
    await Promise.all([
      ...affected.map((t) =>
        tx.store.put({ ...t, category_id: fallback.id, updated_at: nowIso() })
      ),
      tx.done,
    ]);
  }

  const allCatRules = await db.getAll("categoryRules");
  const rulesToDelete = allCatRules.filter((r) => r.category_id === id);
  const ruleTx = db.transaction("categoryRules", "readwrite");
  await Promise.all([
    ...rulesToDelete.map((r) => ruleTx.store.delete(r.id)),
    ruleTx.done,
  ]);

  await db.delete("categories", id);
}

// ---------- Normalization rules ----------
export async function listNormalizationRules(): Promise<NormalizationRule[]> {
  const db = await getDb();
  const all = await db.getAll("normalizationRules");
  return all
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at));
}

export async function listAllNormalizationRules(): Promise<NormalizationRule[]> {
  const db = await getDb();
  const all = await db.getAll("normalizationRules");
  return all.sort(
    (a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at)
  );
}

export async function createNormalizationRule(input: {
  matchType: "CONTAINS" | "REGEX";
  pattern: string;
  replacement: string;
  priority?: number;
}): Promise<NormalizationRule> {
  const db = await getDb();
  const rule: NormalizationRule = {
    id: uid(),
    match_type: input.matchType,
    pattern: input.pattern,
    replacement: input.replacement,
    priority: input.priority ?? 0,
    enabled: 1,
    created_at: nowIso(),
  };
  await db.put("normalizationRules", rule);
  return rule;
}

export async function updateNormalizationRule(
  id: string,
  input: Partial<{
    matchType: "CONTAINS" | "REGEX";
    pattern: string;
    replacement: string;
    priority: number;
    enabled: boolean;
  }>
): Promise<NormalizationRule | undefined> {
  const db = await getDb();
  const current = await db.get("normalizationRules", id);
  if (!current) return undefined;
  const updated: NormalizationRule = {
    ...current,
    match_type: input.matchType ?? current.match_type,
    pattern: input.pattern ?? current.pattern,
    replacement: input.replacement ?? current.replacement,
    priority: input.priority ?? current.priority,
    enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : current.enabled,
  };
  await db.put("normalizationRules", updated);
  return updated;
}

export async function deleteNormalizationRule(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("normalizationRules", id);
}

// ---------- Category rules ----------
export async function listCategoryRules(): Promise<CategoryRule[]> {
  const db = await getDb();
  const all = await db.getAll("categoryRules");
  return all
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at));
}

export async function listAllCategoryRules(): Promise<CategoryRule[]> {
  const db = await getDb();
  const all = await db.getAll("categoryRules");
  return all.sort(
    (a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at)
  );
}

export async function createCategoryRule(input: {
  matchType: MatchType;
  pattern: string;
  categoryId: string;
  priority?: number;
}): Promise<CategoryRule> {
  const db = await getDb();
  const rule: CategoryRule = {
    id: uid(),
    match_type: input.matchType,
    pattern: input.pattern,
    category_id: input.categoryId,
    priority: input.priority ?? 0,
    enabled: 1,
    created_at: nowIso(),
  };
  await db.put("categoryRules", rule);
  return rule;
}

export async function updateCategoryRule(
  id: string,
  input: Partial<{
    matchType: MatchType;
    pattern: string;
    categoryId: string;
    priority: number;
    enabled: boolean;
  }>
): Promise<CategoryRule | undefined> {
  const db = await getDb();
  const current = await db.get("categoryRules", id);
  if (!current) return undefined;
  const updated: CategoryRule = {
    ...current,
    match_type: input.matchType ?? current.match_type,
    pattern: input.pattern ?? current.pattern,
    category_id: input.categoryId ?? current.category_id,
    priority: input.priority ?? current.priority,
    enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : current.enabled,
  };
  await db.put("categoryRules", updated);
  return updated;
}

export async function deleteCategoryRule(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("categoryRules", id);
}

/** Deletes every existing normalization rule and replaces them with the given set. */
export async function replaceNormalizationRules(
  rules: {
    matchType: "CONTAINS" | "REGEX";
    pattern: string;
    replacement: string;
    priority?: number;
    enabled?: boolean;
  }[]
): Promise<void> {
  const db = await getDb();
  const existing = await db.getAll("normalizationRules");
  const now = nowIso();
  const tx = db.transaction("normalizationRules", "readwrite");
  await Promise.all([
    ...existing.map((r) => tx.store.delete(r.id)),
    ...rules.map((r) =>
      tx.store.put({
        id: uid(),
        match_type: r.matchType,
        pattern: r.pattern,
        replacement: r.replacement,
        priority: r.priority ?? 0,
        enabled: r.enabled === false ? 0 : 1,
        created_at: now,
      })
    ),
    tx.done,
  ]);
}

/** Deletes every existing category rule and replaces them with the given set. */
export async function replaceCategoryRules(
  rules: {
    matchType: MatchType;
    pattern: string;
    categoryId: string;
    priority?: number;
    enabled?: boolean;
  }[]
): Promise<void> {
  const db = await getDb();
  const existing = await db.getAll("categoryRules");
  const now = nowIso();
  const tx = db.transaction("categoryRules", "readwrite");
  await Promise.all([
    ...existing.map((r) => tx.store.delete(r.id)),
    ...rules.map((r) =>
      tx.store.put({
        id: uid(),
        match_type: r.matchType,
        pattern: r.pattern,
        category_id: r.categoryId,
        priority: r.priority ?? 0,
        enabled: r.enabled === false ? 0 : 1,
        created_at: now,
      })
    ),
    tx.done,
  ]);
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

export async function listTransactions(
  filter: TransactionFilter
): Promise<{ items: TransactionWithJoins[]; total: number }> {
  const db = await getDb();
  const [allTx, accounts, categories] = await Promise.all([
    db.getAll("transactions"),
    db.getAll("accounts"),
    db.getAll("categories"),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  let filtered = allTx;
  if (filter.yearMonth) {
    filtered = filtered.filter((t) => t.date.startsWith(filter.yearMonth!));
  } else if (filter.year) {
    filtered = filtered.filter((t) => t.date.startsWith(filter.year!));
  }
  if (filter.accountId) {
    filtered = filtered.filter((t) => t.account_id === filter.accountId);
  }
  if (filter.categoryId) {
    filtered = filtered.filter((t) => t.category_id === filter.categoryId);
  }
  if (filter.type) {
    filtered = filtered.filter((t) => t.type === filter.type);
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.raw_description.toLowerCase().includes(q) ||
        t.normalized_name.toLowerCase().includes(q)
    );
  }

  filtered = filtered.sort(
    (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)
  );

  const total = filtered.length;
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 50;
  const offset = (page - 1) * pageSize;
  const pageItems = filtered.slice(offset, offset + pageSize);

  const items: TransactionWithJoins[] = pageItems.map((t) => {
    const account = accountMap.get(t.account_id);
    const category = t.category_id ? categoryMap.get(t.category_id) : undefined;
    return {
      ...t,
      account_name: account?.name ?? "",
      account_type: account?.type ?? "BANK",
      category_name: category?.name ?? null,
      category_color: category?.color ?? null,
    };
  });

  return { items, total };
}

export async function updateTransaction(
  id: string,
  input: Partial<{
    categoryId: string;
    normalizedName: string;
    memo: string | null;
  }>
): Promise<Transaction | undefined> {
  const db = await getDb();
  const current = await db.get("transactions", id);
  if (!current) return undefined;

  let type: TxType = current.type;
  let isManualCategory = current.is_manual_category;
  let categoryId = current.category_id;
  if (input.categoryId !== undefined) {
    const cat = await db.get("categories", input.categoryId);
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

  const updated: Transaction = {
    ...current,
    category_id: categoryId,
    type,
    normalized_name: normalizedName,
    memo,
    is_manual_category: isManualCategory,
    is_manual_name: isManualName,
    updated_at: nowIso(),
  };
  await db.put("transactions", updated);
  return updated;
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("transactions", "readwrite");
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function getDistinctMonths(): Promise<string[]> {
  const db = await getDb();
  const all = await db.getAll("transactions");
  const set = new Set(all.map((t) => t.date.slice(0, 7)));
  return [...set].sort((a, b) => b.localeCompare(a));
}

export async function getDistinctYears(): Promise<string[]> {
  const db = await getDb();
  const all = await db.getAll("transactions");
  const set = new Set(all.map((t) => t.date.slice(0, 4)));
  return [...set].sort((a, b) => b.localeCompare(a));
}

export async function getMeta(): Promise<{
  months: string[];
  years: string[];
  accounts: Account[];
  categories: Category[];
}> {
  const [months, years, accounts, categories] = await Promise.all([
    getDistinctMonths(),
    getDistinctYears(),
    listAccounts(),
    listCategories(),
  ]);
  return { months, years, accounts, categories };
}
