"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const SETTINGS_TABS = [
  { href: "/cai-dat/trung-tam", label: "Trung tâm" },
  { href: "/cai-dat/chi-nhanh", label: "Chi nhánh" },
  { href: "/cai-dat/phong-hoc", label: "Phòng học" },
  { href: "/cai-dat/cap-hoc", label: "Cấp học" },
  { href: "/cai-dat/level", label: "Cấu hình level" },
  { href: "/cai-dat/ca-hoc", label: "Ca học" },
  { href: "/cai-dat/bang-gia", label: "Cấu hình học phí" },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto">
      <nav className="flex w-max min-w-full gap-1 border-b border-slate-200">
        {SETTINGS_TABS.map((tab) => {
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
