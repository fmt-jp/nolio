"use client";

import { useEffect, useState } from "react";
import AccountManager from "./AccountManager";
import ImportWizard from "./ImportWizard";
import { Account } from "@/lib/types";

export default function ImportSettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  function load() {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []));
  }

  useEffect(load, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">データインポート</h1>
      <AccountManager accounts={accounts} onChange={load} />
      <ImportWizard accounts={accounts} />
    </div>
  );
}
