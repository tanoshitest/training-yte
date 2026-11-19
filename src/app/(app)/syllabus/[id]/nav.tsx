"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const SYLLABUS_TABS = [
  ["overview", "Tổng quan"],
  ["curriculum", "Chương trình"],
] as const;

export type SyllabusTab = (typeof SYLLABUS_TABS)[number][0];

const TabCtx = createContext<{
  tab: SyllabusTab;
  setTab: (tab: SyllabusTab) => void;
} | null>(null);

function isTab(value: string | null): value is SyllabusTab {
  return SYLLABUS_TABS.some(([key]) => key === value);
}

export function SyllabusTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<SyllabusTab>("overview");
  const pathname = usePathname();

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    if (isTab(view)) setTabState(view);
  }, []);

  function setTab(next: SyllabusTab) {
    setTabState(next);
    const url = next === "overview" ? pathname : `${pathname}?view=${next}`;
    window.history.replaceState(window.history.state, "", url);
  }

  return <TabCtx.Provider value={{ tab, setTab }}>{children}</TabCtx.Provider>;
}

function useSyllabusTab() {
  const ctx = useContext(TabCtx);
  if (!ctx) throw new Error("SyllabusTabProvider is required.");
  return ctx;
}

export function SyllabusHeader({ syllabusId }: { syllabusId: string }) {
  const { tab, setTab } = useSyllabusTab();
  const pathname = usePathname();
  const onRoot = pathname === `/syllabus/${syllabusId}`;

  return (
    <nav className="relative z-10 flex items-center gap-1" aria-label="Syllabus navigation">
      {SYLLABUS_TABS.map(([key, label]) => {
        const className = cn(
          "rounded-md px-3 py-1.5 text-sm font-medium",
          tab === key ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100",
        );
        if (!onRoot) {
          return (
            <Link
              key={key}
              href={`/syllabus/${syllabusId}${key === "overview" ? "" : `?view=${key}`}`}
              className={className}
            >
              {label}
            </Link>
          );
        }
        return (
          <button key={key} type="button" onClick={() => setTab(key)} className={className}>
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export function SyllabusPanel({ id, children }: { id: SyllabusTab; children: ReactNode }) {
  const { tab } = useSyllabusTab();
  if (tab !== id) return null;
  return <div className="h-full overflow-y-auto">{children}</div>;
}
