"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード", icon: "📊" },
  { href: "/transactions", label: "明細", icon: "📄" },
  { href: "/analysis", label: "分析", icon: "📈" },
  { href: "/settings", label: "設定", icon: "⚙️" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Nolio
            </span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white sm:hidden">
        <div className="mx-auto flex max-w-5xl">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium",
                  active ? "text-slate-900" : "text-slate-400"
                )}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
