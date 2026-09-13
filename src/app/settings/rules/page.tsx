"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryRule, MatchType, NormalizationRule, Category, TxType } from "@/lib/types";
import { formatYen } from "@/lib/format";
import { findTransferCandidates, reapplyRules, TransferCandidate } from "@/lib/importer";
import {
  createCategory,
  createCategoryRule,
  createNormalizationRule,
  deleteCategoryRule,
  deleteNormalizationRule,
  getAutoOtherThreshold,
  listAllCategoryRules,
  listAllNormalizationRules,
  listCategories,
  replaceCategoryRules,
  replaceNormalizationRules,
  setAutoOtherThreshold,
  updateCategoryRule,
  updateNormalizationRule,
} from "@/lib/repo";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function RulesSettingsPage() {
  const [normRules, setNormRules] = useState<NormalizationRule[]>([]);
  const [catRules, setCatRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [candidates, setCandidates] = useState<TransferCandidate[]>([]);
  const [reapplying, setReapplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function loadAll() {
    listAllNormalizationRules().then(setNormRules);
    listAllCategoryRules().then(setCatRules);
    listCategories().then(setCategories);
    findTransferCandidates().then(setCandidates);
  }

  useEffect(loadAll, []);

  async function reapply() {
    setReapplying(true);
    const result = await reapplyRules();
    setReapplying(false);
    setMessage(
      `${result.updated}件の明細に最新のルールを適用しました${
        result.autoOther > 0 ? `（うち${result.autoOther}件は少額・1回限りのため「その他」に分類）` : ""
      }`
    );
    loadAll();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">明細ルール設定</h1>
        <button
          onClick={reapply}
          disabled={reapplying}
          className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
        >
          {reapplying ? "適用中..." : "既存の明細にルールを再適用"}
        </button>
      </div>
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <AutoOtherThresholdSection />

      <TransferCandidatesSection
        candidates={candidates}
        categories={categories}
        onApplied={() => {
          loadAll();
          setMessage("資金移動として登録しました");
        }}
      />

      <NormalizationRulesSection rules={normRules} onChange={loadAll} />

      <CategoryRulesSection rules={catRules} categories={categories} onChange={loadAll} />
    </div>
  );
}

function AutoOtherThresholdSection() {
  const [threshold, setThreshold] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAutoOtherThreshold().then(setThreshold);
  }, []);

  async function save(value: number) {
    const clamped = Math.max(0, Math.round(value) || 0);
    setSaving(true);
    await setAutoOtherThreshold(clamped);
    setThreshold(clamped);
    setSaving(false);
  }

  if (threshold === null) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">少額・1回限りの自動分類</h2>
      <p className="mb-3 text-xs text-slate-400">
        指定した金額以下で、集計名称が1回しか出てこない明細は、取り込み時や「既存の明細にルールを再適用」の際に自動的に「その他」（収入の場合は「その他収入」）に分類されます。同じお店が2回以上出てきたり、金額が上回る場合は通常どおり分類対象になります。0円にすると無効になります。
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step={100}
          className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          onBlur={(e) => save(Number(e.target.value))}
        />
        <span className="text-sm text-slate-500">円以下</span>
        {saving && <span className="text-xs text-slate-400">保存中...</span>}
      </div>
    </div>
  );
}

function TransferCandidatesSection({
  candidates,
  categories,
  onApplied,
}: {
  candidates: TransferCandidate[];
  categories: Category[];
  onApplied: () => void;
}) {
  const transferCategories = categories.filter((c) => c.type === "TRANSFER");

  async function apply(keyword: string, categoryId: string) {
    const existingRules = await listAllCategoryRules();
    const exists = existingRules.some(
      (r) => r.pattern === keyword && r.match_type === "CONTAINS" && r.category_id === categoryId
    );
    if (!exists) {
      await createCategoryRule({ matchType: "CONTAINS", pattern: keyword, categoryId, priority: 10 });
    }
    await reapplyRules();
    onApplied();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">資金移動の候補</h2>
      <p className="mb-3 text-xs text-slate-400">
        クレジットカードの利用代金引落と思われる銀行明細を検出しました。資金移動として登録すると、支出の二重計上を防げます。一度登録すると、次回以降の取り込みにも自動的に適用されます。
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-slate-400">現在、候補はありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {candidates.map((c) => (
            <div
              key={`${c.accountId}-${c.keyword}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="text-sm">
                <div className="font-medium text-slate-700">
                  「{c.keyword}」を含む {c.accountName} の明細 {c.count}件（合計{" "}
                  {formatYen(c.totalAmount)}）
                </div>
                <div className="text-xs text-slate-400">
                  例: {c.sampleDescriptions.join(" / ")}
                </div>
              </div>
              <button
                onClick={() =>
                  apply(
                    c.keyword,
                    transferCategories.find((t) => t.name === "口座振替・カード引落")?.id ??
                      transferCategories[0]?.id
                  )
                }
                className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
              >
                資金移動として登録
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NormalizationRulesSection({
  rules,
  onChange,
}: {
  rules: NormalizationRule[];
  onChange: () => void;
}) {
  const [matchType, setMatchType] = useState<"CONTAINS" | "REGEX">("CONTAINS");
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function exportRules() {
    downloadJson("nolio_normalization_rules.json", {
      kind: "nolio-normalization-rules",
      version: 1,
      rules: rules.map((r) => ({
        matchType: r.match_type,
        pattern: r.pattern,
        replacement: r.replacement,
        priority: r.priority,
        enabled: !!r.enabled,
      })),
    });
  }

  async function importRules(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.kind !== "nolio-normalization-rules" || !Array.isArray(data.rules)) {
        throw new Error("正規化ルールのファイルではないようです");
      }
      if (
        !confirm(
          `現在の正規化ルール（${rules.length}件）をすべて削除し、ファイルの内容（${data.rules.length}件）で上書きします。よろしいですか？`
        )
      ) {
        return;
      }
      await replaceNormalizationRules(data.rules);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "インポートに失敗しました");
    }
  }

  async function add() {
    setError(null);
    if (!pattern.trim() || !replacement.trim()) {
      setError("パターンと置換後の名称を入力してください");
      return;
    }
    if (matchType === "REGEX") {
      try {
        new RegExp(pattern, "u");
      } catch {
        setError("正規表現が不正です");
        return;
      }
    }
    await createNormalizationRule({ matchType, pattern, replacement });
    setPattern("");
    setReplacement("");
    onChange();
  }

  async function remove(id: string) {
    await deleteNormalizationRule(id);
    onChange();
  }

  async function toggle(rule: NormalizationRule) {
    await updateNormalizationRule(rule.id, { enabled: !rule.enabled });
    onChange();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">明細名称の正規化ルール</h2>
        <div className="flex gap-2">
          <button
            onClick={exportRules}
            disabled={rules.length === 0}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
          >
            エクスポート
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            インポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importRules(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        例: 「含む」に「水道代」、置換後の名称に「水道代」と設定すると、「水道代（1月分）」「水道代（2月分）」がすべて「水道代」としてまとめられます。正規表現も利用できます（置換に $1 などのキャプチャが使えます）。
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {rules.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={!!r.enabled}
              onChange={() => toggle(r)}
              title="有効/無効"
            />
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {r.match_type === "CONTAINS" ? "含む" : "正規表現"}
            </span>
            <span className="font-mono text-xs text-slate-600">{r.pattern}</span>
            <span className="text-slate-300">→</span>
            <span className="font-medium">{r.replacement}</span>
            <button
              onClick={() => remove(r.id)}
              className="ml-auto text-xs text-slate-400 hover:text-red-500"
            >
              削除
            </button>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-sm text-slate-400">まだルールがありません</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as "CONTAINS" | "REGEX")}
        >
          <option value="CONTAINS">含む</option>
          <option value="REGEX">正規表現</option>
        </select>
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          placeholder={matchType === "CONTAINS" ? "パターン (例: 水道代)" : "正規表現 (例: ^水道代.*)"}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="置換後の名称 (例: 水道代)"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
        />
        <button
          onClick={add}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          追加
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function CategoryRulesSection({
  rules,
  categories,
  onChange,
}: {
  rules: CategoryRule[];
  categories: Category[];
  onChange: () => void;
}) {
  const [matchType, setMatchType] = useState<MatchType>("CONTAINS");
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!categoryId && categories.length > 0) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  function exportRules() {
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    downloadJson("nolio_category_rules.json", {
      kind: "nolio-category-rules",
      version: 1,
      rules: rules.map((r) => ({
        matchType: r.match_type,
        pattern: r.pattern,
        categoryName: categoryMap.get(r.category_id)?.name ?? "",
        categoryType: categoryMap.get(r.category_id)?.type ?? "EXPENSE",
        priority: r.priority,
        enabled: !!r.enabled,
      })),
    });
  }

  async function importRules(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.kind !== "nolio-category-rules" || !Array.isArray(data.rules)) {
        throw new Error("カテゴリ分類ルールのファイルではないようです");
      }
      if (
        !confirm(
          `現在のカテゴリ分類ルール（${rules.length}件）をすべて削除し、ファイルの内容（${data.rules.length}件）で上書きします。カテゴリ名が一致しない場合は新しいカテゴリを作成します。よろしいですか？`
        )
      ) {
        return;
      }
      const currentCategories = await listCategories();
      const categoryByKey = new Map(currentCategories.map((c) => [`${c.name}${c.type}`, c]));
      const resolved: {
        matchType: MatchType;
        pattern: string;
        categoryId: string;
        priority: number;
        enabled: boolean;
      }[] = [];
      for (const r of data.rules as {
        matchType: MatchType;
        pattern: string;
        categoryName: string;
        categoryType: TxType;
        priority?: number;
        enabled?: boolean;
      }[]) {
        if (!r.pattern || !r.categoryName || !r.categoryType) continue;
        const key = `${r.categoryName}${r.categoryType}`;
        let category = categoryByKey.get(key);
        if (!category) {
          category = await createCategory({ name: r.categoryName, type: r.categoryType });
          categoryByKey.set(key, category);
        }
        resolved.push({
          matchType: r.matchType,
          pattern: r.pattern,
          categoryId: category.id,
          priority: r.priority ?? 0,
          enabled: r.enabled !== false,
        });
      }
      await replaceCategoryRules(resolved);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "インポートに失敗しました");
    }
  }

  async function add() {
    setError(null);
    if (!pattern.trim() || !categoryId) {
      setError("パターンとカテゴリを指定してください");
      return;
    }
    if (matchType === "REGEX") {
      try {
        new RegExp(pattern, "u");
      } catch {
        setError("正規表現が不正です");
        return;
      }
    }
    await createCategoryRule({ matchType, pattern, categoryId });
    setPattern("");
    onChange();
  }

  async function remove(id: string) {
    await deleteCategoryRule(id);
    onChange();
  }

  async function toggle(rule: CategoryRule) {
    await updateCategoryRule(rule.id, { enabled: !rule.enabled });
    onChange();
  }

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">カテゴリ分類ルール</h2>
        <div className="flex gap-2">
          <button
            onClick={exportRules}
            disabled={rules.length === 0}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
          >
            エクスポート
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            インポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importRules(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        例: 「含む」に「セブンイレブン」、カテゴリに「食費」と設定すると、以後「セブンイレブン」を含む明細は自動的に食費に分類されます。
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {rules.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={!!r.enabled}
              onChange={() => toggle(r)}
              title="有効/無効"
            />
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {r.match_type === "CONTAINS" ? "含む" : r.match_type === "EXACT" ? "完全一致" : "正規表現"}
            </span>
            <span className="font-mono text-xs text-slate-600">{r.pattern}</span>
            <span className="text-slate-300">→</span>
            <span className="font-medium">{categoryName(r.category_id)}</span>
            <button
              onClick={() => remove(r.id)}
              className="ml-auto text-xs text-slate-400 hover:text-red-500"
            >
              削除
            </button>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-sm text-slate-400">まだルールがありません</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as MatchType)}
        >
          <option value="CONTAINS">含む</option>
          <option value="EXACT">完全一致</option>
          <option value="REGEX">正規表現</option>
        </select>
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="パターン (例: セブンイレブン)"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          追加
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
