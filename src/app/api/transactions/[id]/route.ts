import { NextRequest, NextResponse } from "next/server";
import { updateTransaction } from "@/lib/repo";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  try {
    const transaction = updateTransaction(id, {
      categoryId: body.categoryId,
      normalizedName: body.normalizedName,
      memo: body.memo,
    });
    if (!transaction) {
      return NextResponse.json({ error: "明細が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ transaction });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新に失敗しました" },
      { status: 400 }
    );
  }
}
