"use client";

import { useEffect, useState } from "react";
import { CategoryRule, MatchType, NormalizationRule, Category } from "@/lib/types";
import { formatYen } from "@/lib/format";
import { TransferCandidate } from "@/lib/importer";

export default function RulesSettingsPage() {
  const [normRules, setNormRules] = useState<NormalizationRule[]>([]);
  const [catRules, setCatRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [candidates, setCandidates] = useState<TransferCandidate[]>([]);
  const [reapplying, setReapplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function loadAll() {
    fetch("/api/rules/normalization")
      .then((r) => r.json())
      .then((d) => setNormRules(d.rules ?? []));
    fetch("/api/rules/category")
      .then((r) => r.json())
      .then((d) => setCatRules(d.rules ?? []));
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/rules/transfer-candidates")
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates ?? []));
  }

  useEffect(loadAll, []);

  async function reapply() {
    setReapplying(true);
    const res = await fetch("/api/rules/reapply", { method: "POST" });
    const data = await res.json();
    setReapplying(false);
    setMessage(`${data.updated}件の明細に最新のルールを適用しました`);
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
    await fetch("/api/rules/transfer-candidates/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, categoryId }),
    });
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

  async function add() {
    setError(null);
    const res = await fetch("/api/rules/normalization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchType, pattern, replacement }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setPattern("");
    setReplacement("");
    onChange();
  }

  async function remove(id: string) {
    await fetch(`/api/rules/normalization/${id}`, { method: "DELETE" });
    onChange();
  }

  async function toggle(rule: NormalizationRule) {
    await fetch(`/api/rules/normalization/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    onChange();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">明細名称の正規化ルール</h2>
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

  useEffect(() => {
    if (!categoryId && categories.length > 0) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  async function add() {
    setError(null);
    const res = await fetch("/api/rules/category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchType, pattern, categoryId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setPattern("");
    onChange();
  }

  async function remove(id: string) {
    await fetch(`/api/rules/category/${id}`, { method: "DELETE" });
    onChange();
  }

  async function toggle(rule: CategoryRule) {
    await fetch(`/api/rules/category/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    onChange();
  }

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-600">カテゴリ分類ルール</h2>
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
