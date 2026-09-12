import { NextRequest, NextResponse } from "next/server";
import { deleteAccount, updateAccount } from "@/lib/repo";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const account = updateAccount(id, {
    name: body.name,
    paymentKeyword: body.paymentKeyword,
  });
  if (!account) {
    return NextResponse.json({ error: "口座が見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ account });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除できません" },
      { status: 400 }
    );
  }
}
