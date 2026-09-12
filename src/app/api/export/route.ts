import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const rows = db
    .prepare(
      `SELECT t.date, a.name as account_name, a.type as account_type,
              t.raw_description, t.normalized_name, c.name as category_name,
              t.type, t.amount, t.memo
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY t.date ASC`
    )
    .all() as Record<string, unknown>[];

  const header = [
    "日付",
    "口座名",
    "口座種別",
    "元明細",
    "集計名称",
    "カテゴリ",
    "取引種別",
    "金額",
    "メモ",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.account_name,
        r.account_type === "BANK" ? "銀行" : "クレジットカード",
        r.raw_description,
        r.normalized_name,
        r.category_name,
        r.type === "INCOME" ? "収入" : r.type === "EXPENSE" ? "支出" : "資金移動",
        r.amount,
        r.memo,
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = "﻿" + lines.join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nolio_export_${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
