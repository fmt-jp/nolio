import { NextRequest, NextResponse } from "next/server";
import { createNormalizationRule, listNormalizationRules } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({ rules: listNormalizationRules() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const pattern = String(body.pattern ?? "").trim();
  const replacement = String(body.replacement ?? "").trim();
  if (!pattern || !replacement) {
    return NextResponse.json({ error: "パターンと置換後の名称を入力してください" }, { status: 400 });
  }
  if (body.matchType === "REGEX") {
    try {
      new RegExp(pattern, "u");
    } catch {
      return NextResponse.json({ error: "正規表現が不正です" }, { status: 400 });
    }
  }
  const rule = createNormalizationRule({
    matchType: body.matchType === "REGEX" ? "REGEX" : "CONTAINS",
    pattern,
    replacement,
    priority: body.priority ?? 0,
  });
  return NextResponse.json({ rule }, { status: 201 });
}
