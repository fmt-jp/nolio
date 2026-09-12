import { CategoryRule, NormalizationRule } from "./types";

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
