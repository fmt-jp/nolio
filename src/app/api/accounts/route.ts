import { NextRequest, NextResponse } from "next/server";
import { createAccount, listAccounts } from "@/lib/repo";
import { AccountType } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ accounts: listAccounts() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const type = body.type as AccountType;
  if (!name) {
    return NextResponse.json({ error: "口座名を入力してください" }, { status: 400 });
  }
  if (type !== "BANK" && type !== "CREDIT_CARD") {
    return NextResponse.json({ error: "口座種別が不正です" }, { status: 400 });
  }
  const account = createAccount({
    name,
    type,
    paymentKeyword: body.paymentKeyword ?? null,
  });
  return NextResponse.json({ account }, { status: 201 });
}
