import { NextRequest, NextResponse } from "next/server";
import { createCategory, listCategories } from "@/lib/repo";
import { TxType } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ categories: listCategories() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const type = body.type as TxType;
  if (!name) {
    return NextResponse.json({ error: "カテゴリ名を入力してください" }, { status: 400 });
  }
  if (!["INCOME", "EXPENSE", "TRANSFER"].includes(type)) {
    return NextResponse.json({ error: "取引種別が不正です" }, { status: 400 });
  }
  const category = createCategory({ name, type, color: body.color ?? null });
  return NextResponse.json({ category }, { status: 201 });
}
