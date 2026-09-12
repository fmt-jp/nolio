import { NextResponse } from "next/server";
import { findTransferCandidates } from "@/lib/importer";

export async function GET() {
  return NextResponse.json({ candidates: findTransferCandidates() });
}
