import { NextRequest, NextResponse } from "next/server";
import { deleteCategoryRule, updateCategoryRule } from "@/lib/repo";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const rule = updateCategoryRule(id, {
    matchType: body.matchType,
    pattern: body.pattern,
    categoryId: body.categoryId,
    priority: body.priority,
    enabled: body.enabled,
  });
  if (!rule) return NextResponse.json({ error: "ルールが見つかりません" }, { status: 404 });
  return NextResponse.json({ rule });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteCategoryRule(id);
  return NextResponse.json({ ok: true });
}
