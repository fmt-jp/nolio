import { getDb } from "./idbClient";
import { uid } from "./id";
import { TxType } from "./types";

const DEFAULT_CATEGORIES: {
  name: string;
  type: TxType;
  color: string;
  isSystem?: boolean;
}[] = [
  // 収入
  { name: "給与", type: "INCOME", color: "#2563eb" },
  { name: "賞与", type: "INCOME", color: "#0891b2" },
  { name: "年金", type: "INCOME", color: "#7c3aed" },
  { name: "その他収入", type: "INCOME", color: "#64748b" },
  { name: "未分類(収入)", type: "INCOME", color: "#94a3b8", isSystem: true },
  // 支出
  { name: "食費・日用品", type: "EXPENSE", color: "#f97316" },
  { name: "外食", type: "EXPENSE", color: "#f59e0b" },
  { name: "住宅", type: "EXPENSE", color: "#84cc16" },
  { name: "光熱水", type: "EXPENSE", color: "#22c55e" },
  { name: "通信・サブスク", type: "EXPENSE", color: "#14b8a6" },
  { name: "車・交通", type: "EXPENSE", color: "#06b6d4" },
  { name: "医療", type: "EXPENSE", color: "#3b82f6" },
  { name: "保険", type: "EXPENSE", color: "#6366f1" },
  { name: "趣味・娯楽", type: "EXPENSE", color: "#a855f7" },
  { name: "教育", type: "EXPENSE", color: "#8b5cf6" },
  { name: "旅行", type: "EXPENSE", color: "#d946ef" },
  { name: "交際", type: "EXPENSE", color: "#ec4899" },
  { name: "ふるさと納税", type: "EXPENSE", color: "#f43f5e" },
  { name: "その他", type: "EXPENSE", color: "#78716c" },
  { name: "未分類(支出)", type: "EXPENSE", color: "#a8a29e", isSystem: true },
  // 資金移動
  { name: "口座振替・カード引落", type: "TRANSFER", color: "#475569" },
  { name: "口座間振替", type: "TRANSFER", color: "#334155" },
  { name: "証券口座入金", type: "TRANSFER", color: "#1e293b" },
  { name: "その他資金移動", type: "TRANSFER", color: "#0f172a" },
];

let seedPromise: Promise<void> | null = null;

export function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const db = await getDb();
      const count = await db.count("categories");
      if (count > 0) return;
      const tx = db.transaction("categories", "readwrite");
      const now = new Date().toISOString();
      await Promise.all([
        ...DEFAULT_CATEGORIES.map((c, i) =>
          tx.store.put({
            id: uid(),
            name: c.name,
            type: c.type,
            sort_order: i,
            color: c.color,
            is_system: c.isSystem ? 1 : 0,
            created_at: now,
          })
        ),
        tx.done,
      ]);
    })();
  }
  return seedPromise;
}

export async function getUncategorizedCategoryId(
  type: "INCOME" | "EXPENSE"
): Promise<string> {
  await ensureSeed();
  const db = await getDb();
  const all = await db.getAll("categories");
  const name = type === "INCOME" ? "未分類(収入)" : "未分類(支出)";
  const found = all.find((c) => c.name === name);
  if (!found) throw new Error(`Default category not found: ${name}`);
  return found.id;
}
