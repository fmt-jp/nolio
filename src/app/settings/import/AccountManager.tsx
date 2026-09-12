"use client";

import { useState } from "react";
import { createAccount, deleteAccount } from "@/lib/repo";
import { Account, AccountType } from "@/lib/types";

export default function AccountManager({
  accounts,
  onChange,
}: {
  accounts: Account[];
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("BANK");
  const [paymentKeyword, setPaymentKeyword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addAccount() {
    if (!name.trim()) return;
    setError(null);
    try {
      await createAccount({
        name: name.trim(),
        type,
        paymentKeyword: paymentKeyword.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
      return;
    }
    setName("");
    setPaymentKeyword("");
    onChange();
  }

  async function removeAccount(id: string) {
    if (!confirm("この口座を削除しますか？")) return;
    try {
      await deleteAccount(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除できません");
      return;
    }
    onChange();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-600">口座・カード管理</h2>

      <div className="mb-4 flex flex-col gap-2">
        {accounts.length === 0 && (
          <p className="text-sm text-slate-400">まだ口座が登録されていません</p>
        )}
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
          >
            <div>
              <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {a.type === "BANK" ? "銀行" : "クレジットカード"}
              </span>
              <span className="font-medium">{a.name}</span>
              {a.payment_keyword && (
                <span className="ml-2 text-xs text-slate-400">
                  (銀行明細キーワード: {a.payment_keyword})
                </span>
              )}
            </div>
            <button
              onClick={() => removeAccount(a.id)}
              className="text-xs text-slate-400 hover:text-red-500"
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">種別</span>
          <select
            className="rounded-lg border border-slate-300 px-2 py-1.5"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            <option value="BANK">銀行口座</option>
            <option value="CREDIT_CARD">クレジットカード</option>
          </select>
        </label>
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-slate-500">口座名</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            placeholder="例: 三井住友銀行 普通"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {type === "CREDIT_CARD" && (
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-slate-500">
              銀行明細での引落表記（任意）
            </span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
              placeholder="例: ○○カード"
              value={paymentKeyword}
              onChange={(e) => setPaymentKeyword(e.target.value)}
            />
          </label>
        )}
        <button
          onClick={addAccount}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          追加
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
