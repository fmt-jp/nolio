import { db } from "./db";
import { randomUUID } from "crypto";

const DEFAULT_CATEGORIES: {
  name: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
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
  { name: "食費", type: "EXPENSE", color: "#f97316" },
  { name: "日用品", type: "EXPENSE", color: "#eab308" },
  { name: "住宅", type: "EXPENSE", color: "#84cc16" },
  { name: "光熱水費", type: "EXPENSE", color: "#22c55e" },
  { name: "通信費", type: "EXPENSE", color: "#14b8a6" },
  { name: "交通費", type: "EXPENSE", color: "#06b6d4" },
  { name: "医療", type: "EXPENSE", color: "#3b82f6" },
  { name: "教育", type: "EXPENSE", color: "#6366f1" },
  { name: "趣味・娯楽", type: "EXPENSE", color: "#a855f7" },
  { name: "旅行", type: "EXPENSE", color: "#d946ef" },
  { name: "交際費", type: "EXPENSE", color: "#ec4899" },
  { name: "その他", type: "EXPENSE", color: "#78716c" },
  { name: "未分類(支出)", type: "EXPENSE", color: "#a8a29e", isSystem: true },
  // 資金移動
  { name: "口座振替・カード引落", type: "TRANSFER", color: "#475569" },
  { name: "口座間振替", type: "TRANSFER", color: "#334155" },
  { name: "証券口座入金", type: "TRANSFER", color: "#1e293b" },
  { name: "その他資金移動", type: "TRANSFER", color: "#0f172a" },
];

export function ensureSeed() {
  const row = db.prepare("SELECT COUNT(*) as c FROM categories").get() as {
    c: number;
  };
  if (row.c > 0) return;

  const insert = db.prepare(
    `INSERT INTO categories (id, name, type, sort_order, color, is_system) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    DEFAULT_CATEGORIES.forEach((c, i) => {
      insert.run(
        randomUUID(),
        c.name,
        c.type,
        i,
        c.color,
        c.isSystem ? 1 : 0
      );
    });
  });
  tx();
}

export function getUncategorizedCategoryId(type: "INCOME" | "EXPENSE"): string {
  ensureSeed();
  const name = type === "INCOME" ? "未分類(収入)" : "未分類(支出)";
  const row = db
    .prepare("SELECT id FROM categories WHERE name = ? LIMIT 1")
    .get(name) as { id: string } | undefined;
  if (!row) throw new Error(`Default category not found: ${name}`);
  return row.id;
}
