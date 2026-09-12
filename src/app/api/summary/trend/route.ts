import { NextRequest, NextResponse } from "next/server";
import { getMonthlyTrend, getYearlyTrend, lastNMonths } from "@/lib/summary";
import { getDistinctYears } from "@/lib/repo";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const unit = sp.get("unit") === "year" ? "year" : "month";

  if (unit === "month") {
    const count = sp.get("count") ? Number(sp.get("count")) : 12;
    const end = sp.get("end") ?? undefined;
    const months = lastNMonths(count, end);
    return NextResponse.json({ unit, points: getMonthlyTrend(months) });
  }

  const countYears = sp.get("count") ? Number(sp.get("count")) : 5;
  const allYears = getDistinctYears();
  const currentYear = String(new Date().getFullYear());
  const years = allYears.length > 0 ? allYears : [currentYear];
  const sortedYears = [...new Set([...years, currentYear])].sort();
  const selected = sortedYears.slice(-countYears);
  return NextResponse.json({ unit, points: getYearlyTrend(selected) });
}
