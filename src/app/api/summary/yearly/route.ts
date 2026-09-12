import { NextRequest, NextResponse } from "next/server";
import { getPeriodSummary } from "@/lib/summary";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = sp.get("year");
  if (!year || !/^\d{4}$/.test(year)) {
    return NextResponse.json({ error: "year (YYYY) を指定してください" }, { status: 400 });
  }
  const summary = getPeriodSummary("year", year);
  return NextResponse.json({ year, ...summary });
}
