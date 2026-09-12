import { NextRequest, NextResponse } from "next/server";
import { createCategoryRule, listCategoryRules } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({ rules: listCategoryRules() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const pattern = String(body.pattern ?? "").trim();
  const categoryId = String(body.categoryId ?? "");
  if (!pattern || !categoryId) {
    return NextResponse.json({ error: "パターンとカテゴリを指定してください" }, { status: 400 });
  }
  const matchType = ["CONTAINS", "EXACT", "REGEX"].includes(body.matchType)
    ? body.matchType
    : "CONTAINS";
  if (matchType === "REGEX") {
    try {
      new RegExp(pattern, "u");
    } catch {
      return NextResponse.json({ error: "正規表現が不正です" }, { status: 400 });
    }
  }
  const rule = createCategoryRule({
    matchType,
    pattern,
    categoryId,
    priority: body.priority ?? 0,
  });
  return NextResponse.json({ rule }, { status: 201 });
}
