"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/hoc-phi", label: "Công nợ học viên" },
  { href: "/hoc-phi/bao-cao", label: "Nhật ký thu hp" },
] as const;

export function HocPhiTabs() {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto">
      <nav className="flex w-max min-w-full gap-1 border-b border-slate-200">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
