import { NextResponse } from "next/server";
import { getDistinctMonths, getDistinctYears, listAccounts, listCategories } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({
    months: getDistinctMonths(),
    years: getDistinctYears(),
    accounts: listAccounts(),
    categories: listCategories(),
  });
}
