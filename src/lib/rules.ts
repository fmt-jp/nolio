import { Category, CategoryRule, NormalizationRule } from "./types";

function cleanWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Built-in fallback normalization: strip common trailing "(N月分)" style suffixes. */
function builtinNormalize(raw: string): string {
  let s = cleanWhitespace(raw);
  s = s.replace(/[（(]\s*\d{1,2}\s*月分?\s*[）)]\s*$/u, "");
  s = s.replace(/[（(]\s*\d{1,2}\/\d{1,2}\s*[）)]\s*$/u, "");
  return cleanWhitespace(s);
}

export function applyNormalization(
  raw: string,
  rules: NormalizationRule[]
): { name: string; matchedRuleId: string | null } {
  for (const rule of rules) {
    try {
      if (rule.match_type === "CONTAINS") {
        if (raw.includes(rule.pattern)) {
          return { name: cleanWhitespace(rule.replacement), matchedRuleId: rule.id };
        }
      } else if (rule.match_type === "REGEX") {
        const re = new RegExp(rule.pattern, "u");
        if (re.test(raw)) {
          return {
            name: cleanWhitespace(raw.replace(re, rule.replacement)),
            matchedRuleId: rule.id,
          };
        }
      }
    } catch {
      // invalid regex authored by user; skip rule
      continue;
    }
  }
  return { name: builtinNormalize(raw), matchedRuleId: null };
}

/**
 * A starter dictionary of well-known Japanese merchant/service names, so common
 * transactions get categorized out of the box without the user having to define
 * any rules. User-defined category rules always take priority over this list.
 */
export const BUILTIN_CATEGORY_KEYWORDS: { pattern: string; categoryName: string }[] = [
  // 食費
  { pattern: "セブンイレブン", categoryName: "食費" },
  { pattern: "セブン-イレブン", categoryName: "食費" },
  { pattern: "ファミリーマート", categoryName: "食費" },
  { pattern: "ローソン", categoryName: "食費" },
  { pattern: "ミニストップ", categoryName: "食費" },
  { pattern: "デイリーヤマザキ", categoryName: "食費" },
  { pattern: "スターバックス", categoryName: "食費" },
  { pattern: "ドトール", categoryName: "食費" },
  { pattern: "タリーズ", categoryName: "食費" },
  { pattern: "マクドナルド", categoryName: "食費" },
  { pattern: "モスバーガー", categoryName: "食費" },
  { pattern: "ケンタッキー", categoryName: "食費" },
  { pattern: "すき家", categoryName: "食費" },
  { pattern: "吉野家", categoryName: "食費" },
  { pattern: "松屋", categoryName: "食費" },
  { pattern: "サイゼリヤ", categoryName: "食費" },
  { pattern: "ガスト", categoryName: "食費" },
  { pattern: "丸亀製麺", categoryName: "食費" },
  { pattern: "スシロー", categoryName: "食費" },
  { pattern: "くら寿司", categoryName: "食費" },
  { pattern: "イトーヨーカドー", categoryName: "食費" },
  { pattern: "業務スーパー", categoryName: "食費" },
  { pattern: "ライフ", categoryName: "食費" },
  { pattern: "マルエツ", categoryName: "食費" },
  { pattern: "サミット", categoryName: "食費" },
  { pattern: "ウーバーイーツ", categoryName: "食費" },
  { pattern: "UBER EATS", categoryName: "食費" },
  { pattern: "出前館", categoryName: "食費" },
  // 日用品
  { pattern: "マツモトキヨシ", categoryName: "日用品" },
  { pattern: "ツルハドラッグ", categoryName: "日用品" },
  { pattern: "サンドラッグ", categoryName: "日用品" },
  { pattern: "ウエルシア", categoryName: "日用品" },
  { pattern: "ココカラファイン", categoryName: "日用品" },
  { pattern: "スギ薬局", categoryName: "日用品" },
  { pattern: "ニトリ", categoryName: "日用品" },
  { pattern: "無印良品", categoryName: "日用品" },
  { pattern: "ダイソー", categoryName: "日用品" },
  { pattern: "セリア", categoryName: "日用品" },
  { pattern: "キャンドゥ", categoryName: "日用品" },
  { pattern: "ユニクロ", categoryName: "日用品" },
  { pattern: "しまむら", categoryName: "日用品" },
  { pattern: "ヨドバシ", categoryName: "日用品" },
  { pattern: "ビックカメラ", categoryName: "日用品" },
  { pattern: "ヤマダデンキ", categoryName: "日用品" },
  { pattern: "コジマ", categoryName: "日用品" },
  // 交通費
  { pattern: "ENEOS", categoryName: "交通費" },
  { pattern: "出光", categoryName: "交通費" },
  { pattern: "コスモ石油", categoryName: "交通費" },
  { pattern: "Suica", categoryName: "交通費" },
  { pattern: "PASMO", categoryName: "交通費" },
  { pattern: "タイムズ", categoryName: "交通費" },
  { pattern: "パーキング", categoryName: "交通費" },
  { pattern: "ETCカード", categoryName: "交通費" },
  { pattern: "高速道路", categoryName: "交通費" },
  { pattern: "日本交通", categoryName: "交通費" },
  { pattern: "GO タクシー", categoryName: "交通費" },
  // 通信費
  { pattern: "NTTドコモ", categoryName: "通信費" },
  { pattern: "au PAY", categoryName: "通信費" },
  { pattern: "auでんき", categoryName: "通信費" },
  { pattern: "ソフトバンク", categoryName: "通信費" },
  { pattern: "楽天モバイル", categoryName: "通信費" },
  { pattern: "ワイモバイル", categoryName: "通信費" },
  { pattern: "mineo", categoryName: "通信費" },
  { pattern: "OCN", categoryName: "通信費" },
  { pattern: "NURO", categoryName: "通信費" },
  // 光熱水費
  { pattern: "電力", categoryName: "光熱水費" },
  { pattern: "東京ガス", categoryName: "光熱水費" },
  { pattern: "大阪ガス", categoryName: "光熱水費" },
  { pattern: "水道局", categoryName: "光熱水費" },
  { pattern: "水道料金", categoryName: "光熱水費" },
  { pattern: "水道代", categoryName: "光熱水費" },
  // 住宅
  { pattern: "家賃", categoryName: "住宅" },
  { pattern: "管理費", categoryName: "住宅" },
  // 医療
  { pattern: "薬局", categoryName: "医療" },
  { pattern: "クリニック", categoryName: "医療" },
  { pattern: "歯科医院", categoryName: "医療" },
  // 趣味・娯楽
  { pattern: "NETFLIX", categoryName: "趣味・娯楽" },
  { pattern: "SPOTIFY", categoryName: "趣味・娯楽" },
  { pattern: "AMAZON PRIME", categoryName: "趣味・娯楽" },
  { pattern: "DMM", categoryName: "趣味・娯楽" },
  { pattern: "DAZN", categoryName: "趣味・娯楽" },
  { pattern: "シネマ", categoryName: "趣味・娯楽" },
  { pattern: "TOHOシネマズ", categoryName: "趣味・娯楽" },
  { pattern: "イオンシネマ", categoryName: "趣味・娯楽" },
  { pattern: "任天堂", categoryName: "趣味・娯楽" },
  { pattern: "PLAYSTATION", categoryName: "趣味・娯楽" },
  { pattern: "STEAM", categoryName: "趣味・娯楽" },
  // 給与
  { pattern: "キュウヨ", categoryName: "給与" },
  { pattern: "給与", categoryName: "給与" },
  { pattern: "給料", categoryName: "給与" },
];

function toComparableText(s: string): string {
  // Full-width Latin/digits/symbols (U+FF01-FF5E) → half-width, then lowercase,
  // so e.g. "ＡＭＡＺＯＮ" and "Amazon" both match a pattern of "amazon".
  const halfWidth = s.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
  return halfWidth.toLowerCase();
}

/** Falls back to the built-in keyword dictionary when no user rule matched. */
export function applyBuiltinCategory(
  normalizedName: string,
  rawDescription: string,
  categories: Category[]
): string | null {
  const targets = [toComparableText(normalizedName), toComparableText(rawDescription)];
  for (const entry of BUILTIN_CATEGORY_KEYWORDS) {
    const pattern = toComparableText(entry.pattern);
    if (targets.some((t) => t.includes(pattern))) {
      const category = categories.find((c) => c.name === entry.categoryName);
      if (category) return category.id;
    }
  }
  return null;
}

export function applyCategoryRules(
  normalizedName: string,
  rawDescription: string,
  rules: CategoryRule[]
): string | null {
  const targets = [normalizedName, rawDescription];
  for (const rule of rules) {
    try {
      for (const target of targets) {
        if (rule.match_type === "CONTAINS" && target.includes(rule.pattern)) {
          return rule.category_id;
        }
        if (rule.match_type === "EXACT" && target === rule.pattern) {
          return rule.category_id;
        }
        if (rule.match_type === "REGEX") {
          const re = new RegExp(rule.pattern, "u");
          if (re.test(target)) return rule.category_id;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}
