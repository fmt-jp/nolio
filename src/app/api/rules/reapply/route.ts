import { NextResponse } from "next/server";
import { reapplyRules } from "@/lib/importer";

export async function POST() {
  const result = reapplyRules();
  return NextResponse.json(result);
}
