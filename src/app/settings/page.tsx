import Link from "next/link";

const ITEMS = [
  {
    href: "/settings/import",
    title: "データインポート",
    desc: "口座の管理と、銀行・クレジットカード明細のCSV取り込み",
    icon: "📥",
  },
  {
    href: "/settings/categories",
    title: "カテゴリ",
    desc: "収入・支出・資金移動のカテゴリを管理",
    icon: "🏷️",
  },
  {
    href: "/settings/rules",
    title: "明細ルール",
    desc: "明細名称の正規化ルール、カテゴリ分類ルール、資金移動の判定",
    icon: "🧩",
  },
  {
    href: "/settings/export",
    title: "データエクスポート",
    desc: "取り込んだ明細をCSVでエクスポート",
    icon: "📤",
  },
];

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">設定</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm"
          >
            <span className="text-2xl">{item.icon}</span>
            <div>
              <div className="font-semibold text-slate-800">{item.title}</div>
              <div className="mt-0.5 text-sm text-slate-500">{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
