import { NextRequest, NextResponse } from "next/server";
import { decodeBuffer, guessMapping, parseCsvText } from "@/lib/csv";
import { getAccount } from "@/lib/repo";
import { ImportMapping } from "@/lib/types";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const accountId = form.get("accountId");
  const encoding = (form.get("encoding") as string) || "AUTO";
  const delimiter = (form.get("delimiter") as string) || ",";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ファイルを選択してください" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "ファイルサイズが大きすぎます (8MB以下)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = decodeBuffer(buf, encoding as "AUTO" | "UTF8" | "SJIS");
  } catch {
    return NextResponse.json({ error: "文字コードの判定に失敗しました" }, { status: 400 });
  }

  const { rows, rowCount } = parseCsvText(text, delimiter);
  if (rowCount === 0) {
    return NextResponse.json({ error: "CSVを解析できませんでした" }, { status: 400 });
  }

  let existingMapping: ImportMapping | null = null;
  if (typeof accountId === "string" && accountId) {
    const account = getAccount(accountId);
    if (account?.import_config) {
      try {
        existingMapping = JSON.parse(account.import_config);
      } catch {
        existingMapping = null;
      }
    }
  }

  const hasHeader = existingMapping?.hasHeader ?? true;
  const suggested = existingMapping ?? guessMapping(rows, hasHeader);

  return NextResponse.json({
    csvText: text,
    sampleRows: rows.slice(0, 15),
    columnCount: rows[0]?.length ?? 0,
    rowCount,
    suggestedMapping: suggested,
    hasSavedMapping: !!existingMapping,
  });
}
