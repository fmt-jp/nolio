import { NextRequest, NextResponse } from "next/server";
import { listTransactions } from "@/lib/repo";
import { TxType } from "@/lib/types";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const result = listTransactions({
    yearMonth: sp.get("yearMonth") ?? undefined,
    year: sp.get("year") ?? undefined,
    accountId: sp.get("accountId") ?? undefined,
    categoryId: sp.get("categoryId") ?? undefined,
    type: (sp.get("type") as TxType) ?? undefined,
    search: sp.get("search") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) : undefined,
    pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
  });
  return NextResponse.json(result);
}
