import { NextRequest, NextResponse } from "next/server";
import { deleteCategory, updateCategory } from "@/lib/repo";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const category = updateCategory(id, {
    name: body.name,
    color: body.color,
    sortOrder: body.sortOrder,
  });
  if (!category) {
    return NextResponse.json({ error: "カテゴリが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ category });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    deleteCategory(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除できません" },
      { status: 400 }
    );
  }
}
