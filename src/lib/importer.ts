import { randomUUID } from "crypto";
import { db } from "./db";
import { buildRows, dedupeHash, ParsedRow, RowError } from "./csv";
import { applyCategoryRules, applyNormalization, getCategoryRules, getNormalizationRules } from "./rules";
import { getUncategorizedCategoryId } from "./seed";
import { getAccount, updateAccount } from "./repo";
import { ImportMapping } from "./types";

export interface CommitResult {
  batchId: string;
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: RowError[];
}

export function commitImport(
  accountId: string,
  rows: string[][],
  mapping: ImportMapping,
  fileName: string | null
): CommitResult {
  const account = getAccount(accountId);
  if (!account) throw new Error("口座が見つかりません");

  const { parsed, errors } = buildRows(rows, mapping);
  const normRules = getNormalizationRules();
  const catRules = getCategoryRules();

  const batchId = randomUUID();
  let newCount = 0;
  let duplicateCount = 0;

  const insertTx = db.prepare(
    `INSERT OR IGNORE INTO transactions
      (id, account_id, import_batch_id, date, raw_description, normalized_name, category_id, type, amount, raw_row, dedupe_hash)
     VALUES (@id, @account_id, @import_batch_id, @date, @raw_description, @normalized_name, @category_id, @type, @amount, @raw_row, @dedupe_hash)`
  );

  const insertBatch = db.prepare(
    `INSERT INTO import_batches (id, account_id, file_name, row_count, new_count, duplicate_count) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updateBatchCounts = db.prepare(
    `UPDATE import_batches SET new_count = ?, duplicate_count = ? WHERE id = ?`
  );

  const runAll = db.transaction((parsedRows: ParsedRow[]) => {
    insertBatch.run(batchId, accountId, fileName, parsedRows.length, 0, 0);
    for (const row of parsedRows) {
      const hash = dedupeHash(row.date, row.rawDescription, row.amount, row.rawRow);
      const { name: normalizedName } = applyNormalization(row.rawDescription, normRules);
      const ruleCategoryId = applyCategoryRules(normalizedName, row.rawDescription, catRules);
      const defaultCategoryId = getUncategorizedCategoryId(
        row.amount >= 0 ? "INCOME" : "EXPENSE"
      );
      const categoryId = ruleCategoryId ?? defaultCategoryId;
      const categoryType = db
        .prepare("SELECT type FROM categories WHERE id = ?")
        .get(categoryId) as { type: "INCOME" | "EXPENSE" | "TRANSFER" };

      const info = insertTx.run({
        id: randomUUID(),
        account_id: accountId,
        import_batch_id: batchId,
        date: row.date,
        raw_description: row.rawDescription,
        normalized_name: normalizedName,
        category_id: categoryId,
        type: categoryType.type,
        amount: row.amount,
        raw_row: JSON.stringify(row.rawRow),
        dedupe_hash: hash,
      });
      if (info.changes > 0) newCount++;
      else duplicateCount++;
    }
    updateBatchCounts.run(newCount, duplicateCount, batchId);
  });

  runAll(parsed);

  updateAccount(accountId, { importConfig: mapping });

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
export function reapplyRules(): { updated: number } {
  const normRules = getNormalizationRules();
  const catRules = getCategoryRules();

  const targets = db
    .prepare(
      `SELECT id, raw_description, is_manual_category, is_manual_name, amount FROM transactions`
    )
    .all() as {
    id: string;
    raw_description: string;
    is_manual_category: number;
    is_manual_name: number;
    amount: number;
  }[];

  const updateStmt = db.prepare(
    `UPDATE transactions SET normalized_name=?, category_id=?, type=?, updated_at=datetime('now') WHERE id=?`
  );

  let updated = 0;
  const runAll = db.transaction(() => {
    for (const t of targets) {
      if (t.is_manual_name && t.is_manual_category) continue;

      const { name: computedName } = applyNormalization(t.raw_description, normRules);
      const normalizedName = t.is_manual_name ? null : computedName;

      if (t.is_manual_category) {
        if (normalizedName !== null) {
          db.prepare(`UPDATE transactions SET normalized_name=? WHERE id=?`).run(
            normalizedName,
            t.id
          );
          updated++;
        }
        continue;
      }

      const nameForMatch = normalizedName ?? computedName;
      const ruleCategoryId = applyCategoryRules(nameForMatch, t.raw_description, catRules);
      const defaultCategoryId = getUncategorizedCategoryId(
        t.amount >= 0 ? "INCOME" : "EXPENSE"
      );
      const categoryId = ruleCategoryId ?? defaultCategoryId;
      const categoryType = db
        .prepare("SELECT type FROM categories WHERE id = ?")
        .get(categoryId) as { type: "INCOME" | "EXPENSE" | "TRANSFER" };

      updateStmt.run(nameForMatch, categoryId, categoryType.type, t.id);
      updated++;
    }
  });
  runAll();

  return { updated };
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
export function findTransferCandidates(): TransferCandidate[] {
  const banks = db
    .prepare("SELECT id, name FROM accounts WHERE type = 'BANK'")
    .all() as { id: string; name: string }[];
  const cards = db
    .prepare("SELECT id, name, payment_keyword FROM accounts WHERE type = 'CREDIT_CARD'")
    .all() as { id: string; name: string; payment_keyword: string | null }[];

  const results: TransferCandidate[] = [];

  for (const bank of banks) {
    const bankTx = db
      .prepare(
        `SELECT normalized_name, raw_description, amount FROM transactions
         WHERE account_id = ? AND type != 'TRANSFER' AND is_manual_category = 0`
      )
      .all(bank.id) as { normalized_name: string; raw_description: string; amount: number }[];

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
