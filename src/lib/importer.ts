import { getDb } from "./idbClient";
import { uid } from "./id";
import { buildRows, dedupeHash, parseCsvText, RowError } from "./csv";
import { applyCategoryRules, applyNormalization } from "./rules";
import { getUncategorizedCategoryId } from "./seed";
import {
  createAccount,
  createCategory,
  getAccount,
  listAccounts,
  listCategories,
  listCategoryRules,
  listNormalizationRules,
  updateAccount,
} from "./repo";
import { AccountType, ImportMapping, Transaction, TxType } from "./types";

export interface CommitResult {
  batchId: string;
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: RowError[];
}

function nowIso(): string {
  return new Date().toISOString();
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
  const [normRules, catRules, categories] = await Promise.all([
    listNormalizationRules(),
    listCategoryRules(),
    listCategories(),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

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
    const defaultCategoryId = await getUncategorizedCategoryId(
      row.amount >= 0 ? "INCOME" : "EXPENSE"
    );
    const categoryId = ruleCategoryId ?? defaultCategoryId;
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

  return {
    batchId,
    totalRows: rows.length - (mapping.hasHeader ? 1 : 0),
    newCount,
    duplicateCount,
    errorCount: errors.length,
    errors: errors.slice(0, 50),
  };
}

/** Re-apply current normalization/category rules to existing transactions that were not manually edited. */
export async function reapplyRules(): Promise<{ updated: number }> {
  const db = await getDb();
  const [normRules, catRules, categories, allTx] = await Promise.all([
    listNormalizationRules(),
    listCategoryRules(),
    listCategories(),
    db.getAll("transactions"),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

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
    const defaultCategoryId = await getUncategorizedCategoryId(
      t.amount >= 0 ? "INCOME" : "EXPENSE"
    );
    const categoryId = ruleCategoryId ?? defaultCategoryId;
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

/**
 * Restore transactions from a CSV produced by this app's own "データエクスポート"
 * (設定 → データインポート → Nolioのエクスポートデータ). Accounts and categories
 * are matched by name (their ids are per-browser and not portable), and created
 * automatically when missing — this is how data moves between browsers/devices.
 */
export async function restoreFromNolioExport(csvText: string): Promise<RestoreResult> {
  const { rows } = parseCsvText(csvText, ",");
  const dataRows = rows.slice(1); // fixed header row from our own export
  if (dataRows.length === 0) throw new Error("CSVを解析できませんでした");

  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  const accountByKey = new Map(accounts.map((a) => [`${a.name}${a.type}`, a]));
  const categoryByKey = new Map(categories.map((c) => [`${c.name}${c.type}`, c]));

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

    const accountKey = `${accountName}${accountType}`;
    let account = accountByKey.get(accountKey);
    if (!account) {
      account = await createAccount({ name: accountName, type: accountType });
      accountByKey.set(accountKey, account);
      accountsCreated++;
    }

    const categoryKey = `${categoryName}${txType}`;
    let category = categoryName ? categoryByKey.get(categoryKey) : undefined;
    if (!category && categoryName) {
      category = await createCategory({ name: categoryName, type: txType });
      categoryByKey.set(categoryKey, category);
      categoriesCreated++;
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
