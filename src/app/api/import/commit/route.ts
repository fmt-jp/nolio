import { NextRequest, NextResponse } from "next/server";
import { parseCsvText } from "@/lib/csv";
import { commitImport } from "@/lib/importer";
import { ImportMapping } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { accountId, csvText, mapping, fileName } = body as {
    accountId: string;
    csvText: string;
    mapping: ImportMapping;
    fileName?: string;
  };

  if (!accountId || !csvText || !mapping) {
    return NextResponse.json({ error: "必要な情報が不足しています" }, { status: 400 });
  }
  if (
    mapping.dateColumnIndex == null ||
    mapping.descriptionColumnIndex == null ||
    !mapping.amountMode
  ) {
    return NextResponse.json({ error: "列の対応付けが不完全です" }, { status: 400 });
  }

  try {
    const { rows } = parseCsvText(csvText, mapping.delimiter || ",");
    const result = commitImport(accountId, rows, mapping, fileName ?? null);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "インポートに失敗しました" },
      { status: 400 }
    );
  }
}
