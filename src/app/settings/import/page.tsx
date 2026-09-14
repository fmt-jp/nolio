"use client";

import { useEffect, useState } from "react";
import AccountManager from "./AccountManager";
import ImportWizard from "./ImportWizard";
import { listAccounts } from "@/lib/repo";
import { Account } from "@/lib/types";

export default function ImportSettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  function load() {
    listAccounts().then(setAccounts);
  }

  useEffect(load, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">明細取り込み</h1>
      <AccountManager accounts={accounts} onChange={load} />
      <ImportWizard accounts={accounts} />
    </div>
  );
}
