import { getDb } from "./idbClient";
import { uid } from "./id";
import { buildRows, dedupeHash, parseCsvText, RowError } from "./csv";
import { applyBuiltinCategory, applyCategoryRules, applyNormalization } from "./rules";
import { getUncategorizedCategoryId } from "./seed";
import {
  createAccount,
  createCategory,
  createCategoryRule,
  getAccount,
  getAutoOtherThreshold,
  listAccounts,
  listAllCategoryRules,
  listCategories,
  listCategoryRules,
  listNormalizationRules,
  updateAccount,
} from "./repo";
import { Account, AccountType, Category, ImportMapping, Transaction, TxType } from "./types";

export interface CommitResult {
  batchId: string;
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: RowError[];
  autoOtherCount: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Resolves the transfer category used for card-payment transfer detection,
 * matching how 資金移動の候補 → 資金移動として登録 already resolves it. */
function resolveCardPaymentCategoryId(categories: Category[]): string | null {
  const transferCategories = categories.filter((c) => c.type === "TRANSFER");
  return (
    transferCategories.find((c) => c.name === "口座振替・カード引落")?.id ??
    transferCategories[0]?.id ??
    null
  );
}

/**
 * For a BANK account transaction, checks whether its description matches any
 * registered credit card's "銀行明細での引落表記"(payment_keyword) — if so it's
 * almost certainly that card's bill being paid, not a real expense, so it gets
 * auto-classified as a resource transfer right away instead of waiting for the
 * user to find it later via 資金移動の候補. Only payment_keyword is used here
 * (an explicit hint the user typed for exactly this purpose); a card's plain
 * name alone stays in the 資金移動の候補 suggestion flow, where a false match is
 * just an ignorable suggestion rather than a silent miscategorization.
 */
function applyCardPaymentTransfer(
  normalizedName: string,
  rawDescription: string,
  accountType: AccountType,
  cardAccounts: Account[],
  categories: Category[]
): string | null {
  if (accountType !== "BANK") return null;
  const matched = cardAccounts.some(
    (card) =>
      card.payment_keyword &&
      (normalizedName.includes(card.payment_keyword) ||
        rawDescription.includes(card.payment_keyword))
  );
  if (!matched) return null;
  return resolveCardPaymentCategoryId(categories);
}

export async function commitImport(
  accountId: string,
  rows: string[][],
  mapping: ImportMapping,
  fileName: string | null
): Promise<CommitResult> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("口座が見つかりません");

  const { parsed, errors } = buildRows(rows, mapping);
  const [normRules, catRules, categories, accounts] = await Promise.all([
    listNormalizationRules(),
    listCategoryRules(),
    listCategories(),
    listAccounts(),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const cardAccounts = accounts.filter((a) => a.type === "CREDIT_CARD");

  const db = await getDb();
  const existingForAccount = await db.getAllFromIndex(
    "transactions",
    "by_account",
    accountId
  );
  const existingHashes = new Set(existingForAccount.map((t) => t.dedupe_hash));

  const batchId = uid();
  const now = nowIso();
  const newTransactions: Transaction[] = [];
  let newCount = 0;
  let duplicateCount = 0;

  for (const row of parsed) {
    const hash = dedupeHash(row.date, row.rawDescription, row.amount, row.rawRow);
    if (existingHashes.has(hash)) {
      duplicateCount++;
      continue;
    }
    existingHashes.add(hash);

    const { name: normalizedName } = applyNormalization(row.rawDescription, normRules);
    const ruleCategoryId = applyCategoryRules(normalizedName, row.rawDescription, catRules);
    const transferCategoryId = applyCardPaymentTransfer(
      normalizedName,
      row.rawDescription,
      account.type,
      cardAccounts,
      categories
    );
    const builtinCategoryId = applyBuiltinCategory(normalizedName, row.rawDescription, categories);
    const defaultCategoryId = await getUncategorizedCategoryId(
      row.amount >= 0 ? "INCOME" : "EXPENSE"
    );
    const categoryId = ruleCategoryId ?? transferCategoryId ?? builtinCategoryId ?? defaultCategoryId;
    const categoryType = categoryMap.get(categoryId)?.type ?? "EXPENSE";

    newTransactions.push({
      id: uid(),
      account_id: accountId,
      import_batch_id: batchId,
      date: row.date,
      raw_description: row.rawDescription,
      normalized_name: normalizedName,
      category_id: categoryId,
      type: categoryType,
      amount: row.amount,
      memo: row.memo,
      raw_row: JSON.stringify(row.rawRow),
      dedupe_hash: hash,
      is_manual_category: 0,
      is_manual_name: 0,
      created_at: now,
      updated_at: now,
    });
    newCount++;
  }

  const tx = db.transaction(["transactions", "importBatches"], "readwrite");
  await Promise.all([
    ...newTransactions.map((t) => tx.objectStore("transactions").put(t)),
    tx.objectStore("importBatches").put({
      id: batchId,
      account_id: accountId,
      file_name: fileName,
      imported_at: now,
      row_count: parsed.length,
      new_count: newCount,
      duplicate_count: duplicateCount,
    }),
    tx.done,
  ]);

  await updateAccount(accountId, { importConfig: mapping });

  const { updated: autoOtherCount } = await applyAutoOtherForSmallOneOffs();

  return {
    batchId,
    totalRows: rows.length - (mapping.hasHeader ? 1 : 0),
    newCount,
    duplicateCount,
    errorCount: errors.length,
    errors: errors.slice(0, 50),
    autoOtherCount,
  };
}

/** Re-apply current normalization/category rules to existing transactions that were not manually edited. */
export async function reapplyRules(): Promise<{ updated: number; autoOther: number }> {
  const db = await getDb();
  const [normRules, catRules, categories, allTx, accounts] = await Promise.all([
    listNormalizationRules(),
    listCategoryRules(),
    listCategories(),
    db.getAll("transactions"),
    listAccounts(),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const cardAccounts = accounts.filter((a) => a.type === "CREDIT_CARD");

  const toUpdate: Transaction[] = [];
  for (const t of allTx) {
    if (t.is_manual_name && t.is_manual_category) continue;

    const { name: computedName } = applyNormalization(t.raw_description, normRules);
    const normalizedName = t.is_manual_name ? t.normalized_name : computedName;

    if (t.is_manual_category) {
      if (!t.is_manual_name) {
        toUpdate.push({ ...t, normalized_name: normalizedName, updated_at: nowIso() });
      }
      continue;
    }

    const ruleCategoryId = applyCategoryRules(normalizedName, t.raw_description, catRules);
    const transferCategoryId = applyCardPaymentTransfer(
      normalizedName,
      t.raw_description,
      accountMap.get(t.account_id)?.type ?? "BANK",
      cardAccounts,
      categories
    );
    const builtinCategoryId = applyBuiltinCategory(normalizedName, t.raw_description, categories);
    const defaultCategoryId = await getUncategorizedCategoryId(
      t.amount >= 0 ? "INCOME" : "EXPENSE"
    );
    const categoryId = ruleCategoryId ?? transferCategoryId ?? builtinCategoryId ?? defaultCategoryId;
    const categoryType = categoryMap.get(categoryId)?.type ?? "EXPENSE";

    toUpdate.push({
      ...t,
      normalized_name: normalizedName,
      category_id: categoryId,
      type: categoryType,
      updated_at: nowIso(),
    });
  }

  if (toUpdate.length > 0) {
    const tx = db.transaction("transactions", "readwrite");
    await Promise.all([...toUpdate.map((t) => tx.store.put(t)), tx.done]);
  }

  const { updated: autoOther } = await applyAutoOtherForSmallOneOffs();

  return { updated: toUpdate.length, autoOther };
}

/**
 * Files away merchants that only ever show up once, for amounts at or below the
 * user's threshold, into "その他"/"その他収入" — so the "未分類をまとめて分類"
 * list only surfaces merchants worth a human's attention (recurring or costly).
 * Leaves manually-categorized transactions untouched.
 */
export async function applyAutoOtherForSmallOneOffs(): Promise<{ updated: number }> {
  const threshold = await getAutoOtherThreshold();
  if (threshold <= 0) return { updated: 0 };

  const db = await getDb();
  const [allTx, categories] = await Promise.all([db.getAll("transactions"), listCategories()]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const otherExpense = categories.find((c) => c.type === "EXPENSE" && c.name === "その他");
  const otherIncome = categories.find((c) => c.type === "INCOME" && c.name === "その他収入");

  const groups = new Map<string, Transaction[]>();
  for (const t of allTx) {
    if (t.is_manual_category) continue;
    const category = t.category_id ? categoryMap.get(t.category_id) : undefined;
    if (!category?.is_system) continue; // only still-未分類 transactions
    if (t.type !== "INCOME" && t.type !== "EXPENSE") continue;

    const key = `${t.normalized_name}::${t.type}`;
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const now = nowIso();
  const toUpdate: Transaction[] = [];
  for (const txs of groups.values()) {
    if (txs.length !== 1) continue; // recurring merchants stay for real review
    const t = txs[0];
    if (Math.abs(t.amount) > threshold) continue;
    const target = t.type === "EXPENSE" ? otherExpense : otherIncome;
    if (!target) continue;
    toUpdate.push({ ...t, category_id: target.id, type: target.type, updated_at: now });
  }

  if (toUpdate.length > 0) {
    const tx = db.transaction("transactions", "readwrite");
    await Promise.all([...toUpdate.map((t) => tx.store.put(t)), tx.done]);
  }

  return { updated: toUpdate.length };
}

export interface TransferCandidate {
  keyword: string;
  accountId: string;
  accountName: string;
  matchAccountId: string;
  matchAccountName: string;
  count: number;
  totalAmount: number;
  sampleDescriptions: string[];
}

/** Find bank transactions whose description mentions a registered credit-card account,
 * suggesting they are card-payment transfers rather than real expenses. */
export async function findTransferCandidates(): Promise<TransferCandidate[]> {
  const db = await getDb();
  const [accounts, allTx] = await Promise.all([
    db.getAll("accounts"),
    db.getAll("transactions"),
  ]);
  const banks = accounts.filter((a) => a.type === "BANK");
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");

  const results: TransferCandidate[] = [];

  for (const bank of banks) {
    const bankTx = allTx.filter(
      (t) => t.account_id === bank.id && t.type !== "TRANSFER" && t.is_manual_category === 0
    );

    for (const card of cards) {
      const keywords = [card.payment_keyword, card.name].filter(
        (k): k is string => !!k && k.length > 0
      );
      for (const keyword of keywords) {
        const matches = bankTx.filter(
          (t) => t.normalized_name.includes(keyword) || t.raw_description.includes(keyword)
        );
        if (matches.length === 0) continue;
        results.push({
          keyword,
          accountId: bank.id,
          accountName: bank.name,
          matchAccountId: card.id,
          matchAccountName: card.name,
          count: matches.length,
          totalAmount: matches.reduce((s, m) => s + m.amount, 0),
          sampleDescriptions: [...new Set(matches.map((m) => m.raw_description))].slice(0, 5),
        });
        break; // avoid duplicate suggestion per card via multiple keywords
      }
    }
  }

  return results;
}

export interface RestoreResult {
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  accountsCreated: number;
  categoriesCreated: number;
}

const ACCOUNT_TYPE_JA: Record<string, AccountType> = {
  銀行: "BANK",
  クレジットカード: "CREDIT_CARD",
};
const TX_TYPE_JA: Record<string, TxType> = {
  収入: "INCOME",
  支出: "EXPENSE",
  資金移動: "TRANSFER",
};

export interface MissingCategoryInfo {
  key: string;
  name: string;
  type: TxType;
  count: number;
}

/**
 * Scans a Nolio-export CSV for categories that don't exist yet in this browser,
 * so the caller can ask the user, per missing category, whether to create it or
 * map it onto an existing category — before committing anything.
 */
export async function previewNolioExportCategories(
  csvText: string
): Promise<MissingCategoryInfo[]> {
  const { rows } = parseCsvText(csvText, ",");
  const dataRows = rows.slice(1);
  const categories = await listCategories();
  const existingKeys = new Set(categories.map((c) => `${c.name}::${c.type}`));

  const missing = new Map<string, MissingCategoryInfo>();
  for (const row of dataRows) {
    const [, , , , , categoryName, txTypeJa] = row;
    const txType = TX_TYPE_JA[txTypeJa];
    if (!categoryName || !txType) continue;
    const key = `${categoryName}::${txType}`;
    if (existingKeys.has(key)) continue;
    const cur = missing.get(key) ?? { key, name: categoryName, type: txType, count: 0 };
    cur.count += 1;
    missing.set(key, cur);
  }
  return [...missing.values()].sort((a, b) => b.count - a.count);
}

export type CategoryImportDecision =
  | { action: "create" }
  | { action: "map"; targetCategoryId: string };

/**
 * Restore transactions from a CSV produced by this app's own "データエクスポート"
 * (設定 → データエクスポート・インポート → データインポート). Accounts and categories
 * are matched by name (their ids are per-browser and not portable), and created
 * automatically when missing — this is how data moves between browsers/devices.
 */
export async function restoreFromNolioExport(
  csvText: string,
  categoryDecisions?: Map<string, CategoryImportDecision>
): Promise<RestoreResult> {
  const { rows } = parseCsvText(csvText, ",");
  const dataRows = rows.slice(1); // fixed header row from our own export
  if (dataRows.length === 0) throw new Error("CSVを解析できませんでした");

  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  const accountByKey = new Map(accounts.map((a) => [`${a.name}::${a.type}`, a]));
  const categoryByKey = new Map(categories.map((c) => [`${c.name}::${c.type}`, c]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const db = await getDb();
  const existingHashCache = new Map<string, Set<string>>();
  async function getExistingHashes(accountId: string): Promise<Set<string>> {
    let set = existingHashCache.get(accountId);
    if (!set) {
      const existing = await db.getAllFromIndex("transactions", "by_account", accountId);
      set = new Set(existing.map((t) => t.dedupe_hash));
      existingHashCache.set(accountId, set);
    }
    return set;
  }

  let accountsCreated = 0;
  let categoriesCreated = 0;
  let newCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  const now = nowIso();
  const newTransactions: Transaction[] = [];

  for (const row of dataRows) {
    const [date, accountName, accountTypeJa, rawDescription, normalizedName, categoryName, txTypeJa, amountStr, memo] =
      row;
    const accountType = ACCOUNT_TYPE_JA[accountTypeJa];
    const txType = TX_TYPE_JA[txTypeJa];
    const amount = Number(amountStr);
    if (!date || !accountName || !accountType || !txType || !rawDescription || Number.isNaN(amount)) {
      errorCount++;
      continue;
    }

    const accountKey = `${accountName}::${accountType}`;
    let account = accountByKey.get(accountKey);
    if (!account) {
      account = await createAccount({ name: accountName, type: accountType });
      accountByKey.set(accountKey, account);
      accountsCreated++;
    }

    const categoryKey = `${categoryName}::${txType}`;
    let category = categoryName ? categoryByKey.get(categoryKey) : undefined;
    if (!category && categoryName) {
      const decision = categoryDecisions?.get(categoryKey);
      if (decision?.action === "map") {
        category = categoryById.get(decision.targetCategoryId);
      }
      if (!category) {
        category = await createCategory({ name: categoryName, type: txType });
        categoriesCreated++;
      }
      categoryByKey.set(categoryKey, category);
    }
    const categoryId = category
      ? category.id
      : await getUncategorizedCategoryId(txType === "EXPENSE" ? "EXPENSE" : "INCOME");

    const hash = dedupeHash(date, rawDescription, amount, row);
    const existingHashes = await getExistingHashes(account.id);
    if (existingHashes.has(hash)) {
      duplicateCount++;
      continue;
    }
    existingHashes.add(hash);

    newTransactions.push({
      id: uid(),
      account_id: account.id,
      import_batch_id: null,
      date,
      raw_description: rawDescription,
      normalized_name: normalizedName || rawDescription,
      category_id: categoryId,
      type: txType,
      amount,
      memo: memo || null,
      raw_row: JSON.stringify(row),
      dedupe_hash: hash,
      is_manual_category: 0,
      is_manual_name: normalizedName && normalizedName !== rawDescription ? 1 : 0,
      created_at: now,
      updated_at: now,
    });
    newCount++;
  }

  if (newTransactions.length > 0) {
    const tx = db.transaction("transactions", "readwrite");
    await Promise.all([...newTransactions.map((t) => tx.store.put(t)), tx.done]);
  }

  return { newCount, duplicateCount, errorCount, accountsCreated, categoriesCreated };
}

export interface UncategorizedGroup {
  normalizedName: string;
  type: "INCOME" | "EXPENSE";
  count: number;
  totalAmount: number;
  transactionIds: string[];
  suggestedCategoryId: string | null;
}

/** Groups every still-未分類 transaction by its aggregation name, so the user can
 * categorize a whole merchant at once instead of transaction-by-transaction. */
export async function getUncategorizedGroups(): Promise<UncategorizedGroup[]> {
  const db = await getDb();
  const [allTx, categories] = await Promise.all([db.getAll("transactions"), listCategories()]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const groups = new Map<string, UncategorizedGroup>();
  for (const t of allTx) {
    const category = t.category_id ? categoryMap.get(t.category_id) : undefined;
    if (!category?.is_system) continue; // only 未分類(収入)/未分類(支出)
    if (t.type !== "INCOME" && t.type !== "EXPENSE") continue;

    const key = `${t.normalized_name}::${t.type}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        normalizedName: t.normalized_name,
        type: t.type,
        count: 0,
        totalAmount: 0,
        transactionIds: [],
        suggestedCategoryId: applyBuiltinCategory(t.normalized_name, t.raw_description, categories),
      };
      groups.set(key, g);
    }
    g.count++;
    g.totalAmount += Math.abs(t.amount);
    g.transactionIds.push(t.id);
  }

  return [...groups.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

/** Assigns a category to every transaction in the group, and remembers the choice
 * as a category rule so future imports of the same merchant are classified automatically. */
export async function applyCategoryToGroup(
  transactionIds: string[],
  categoryId: string,
  normalizedName: string
): Promise<void> {
  const db = await getDb();
  const category = await db.get("categories", categoryId);
  if (!category) throw new Error("カテゴリが見つかりません");

  const records = await Promise.all(transactionIds.map((id) => db.get("transactions", id)));
  const now = nowIso();
  const tx = db.transaction("transactions", "readwrite");
  await Promise.all([
    ...records
      .filter((t): t is Transaction => !!t)
      .map((t) =>
        tx.store.put({
          ...t,
          category_id: categoryId,
          type: category.type,
          is_manual_category: 1,
          updated_at: now,
        })
      ),
    tx.done,
  ]);

  const existingRules = await listAllCategoryRules();
  const alreadyExists = existingRules.some(
    (r) =>
      r.match_type === "CONTAINS" && r.pattern === normalizedName && r.category_id === categoryId
  );
  if (!alreadyExists) {
    await createCategoryRule({
      matchType: "CONTAINS",
      pattern: normalizedName,
      categoryId,
      priority: 5,
    });
  }
}
