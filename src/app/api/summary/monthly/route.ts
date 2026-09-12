import { NextRequest, NextResponse } from "next/server";
import { getPeriodSummary } from "@/lib/summary";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const yearMonth = sp.get("yearMonth");
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: "yearMonth (YYYY-MM) を指定してください" }, { status: 400 });
  }
  const summary = getPeriodSummary("month", yearMonth);
  return NextResponse.json({ yearMonth, ...summary });
}
