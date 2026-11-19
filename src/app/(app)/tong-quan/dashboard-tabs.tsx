"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export function DashboardTabs({
  overview,
  activity,
  task,
}: {
  overview: React.ReactNode;
  activity: React.ReactNode;
  task: React.ReactNode;
}) {
  const [tab, setTab] = useState<"overview" | "activity" | "task">("overview");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
          Activity
        </TabButton>
        <TabButton active={tab === "task"} onClick={() => setTab("task")}>
          Task
        </TabButton>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden pt-3">
        <div hidden={tab !== "overview"} className="h-full overflow-auto">
          {overview}
        </div>
        <div hidden={tab !== "activity"} className="h-full overflow-auto">
          {activity}
        </div>
        <div hidden={tab !== "task"} className="h-full overflow-auto">
          {task}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
        active
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-slate-500 hover:text-slate-800",
      )}
    >
      {children}
    </button>
  );
}
