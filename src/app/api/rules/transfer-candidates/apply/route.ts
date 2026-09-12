import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCategoryRule, listCategories } from "@/lib/repo";
import { reapplyRules } from "@/lib/importer";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const keyword = String(body.keyword ?? "").trim();
  if (!keyword) {
    return NextResponse.json({ error: "キーワードを指定してください" }, { status: 400 });
  }

  let categoryId = body.categoryId as string | undefined;
  if (!categoryId) {
    const fallback = listCategories().find(
      (c) => c.type === "TRANSFER" && c.name === "口座振替・カード引落"
    );
    categoryId = fallback?.id;
  }
  if (!categoryId) {
    return NextResponse.json({ error: "カテゴリが見つかりません" }, { status: 400 });
  }

  const existing = db
    .prepare(
      "SELECT id FROM category_rules WHERE pattern = ? AND match_type = 'CONTAINS' AND category_id = ?"
    )
    .get(keyword, categoryId);

  if (!existing) {
    createCategoryRule({ matchType: "CONTAINS", pattern: keyword, categoryId, priority: 10 });
  }

  const result = reapplyRules();
  return NextResponse.json({ ok: true, ...result });
}
