import { getDb } from "./idbClient";
import { uid } from "./id";
import { buildRows, dedupeHash, RowError } from "./csv";
import { applyCategoryRules, applyNormalization } from "./rules";
import { getUncategorizedCategoryId } from "./seed";
import {
  getAccount,
  listCategories,
  listCategoryRules,
  listNormalizationRules,
  updateAccount,
} from "./repo";
import { ImportMapping, Transaction } from "./types";

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
