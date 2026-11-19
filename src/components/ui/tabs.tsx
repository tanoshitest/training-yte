"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Tab chuyển nội dung trong cùng một trang.
 *
 * Panel không hiện được ẩn bằng `hidden` chứ không unmount: ở màn soạn buổi học
 * cả 3 tab nằm trong cùng một <form> và chỉ có một nút Lưu — gỡ khỏi DOM là mất
 * dữ liệu người dùng vừa gõ ở tab khác.
 */
export type TabItem = { key: string; label: string; content: React.ReactNode };

export function TabGroup({
  tabs,
  variant = "main",
  fill = false,
  trailing,
  renderBar,
}: {
  tabs: TabItem[];
  variant?: "main" | "sub";
  /** Thanh tab đứng yên, chỉ phần nội dung bên dưới cuộn. */
  fill?: boolean;
  trailing?: React.ReactNode;
  /** Đưa thanh tab ra chỗ khác (vd. sticky header) mà vẫn giữ panel trong form. */
  renderBar?: (bar: React.ReactNode) => React.ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  const bar = (
    <div
      className={cn(
        "flex items-center gap-2",
        variant === "main" && !renderBar && "border-b border-slate-200",
        variant === "sub" && "rounded-lg bg-slate-100 p-1",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 gap-0.5",
          renderBar ? "flex-nowrap overflow-x-auto" : "flex-wrap",
          variant === "sub" && "gap-1",
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={cn(
                "font-medium transition-colors",
                variant === "main"
                  ? cn(
                      "-mb-px whitespace-nowrap border-b-2 px-2 py-1.5 text-sm",
                      isActive
                        ? "border-brand-600 text-brand-700"
                        : "border-transparent text-slate-500 hover:text-slate-800",
                    )
                  : cn(
                      "rounded-md px-3 py-1.5 text-sm",
                      isActive
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800",
                    ),
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {trailing ? <div className="shrink-0 pb-0.5">{trailing}</div> : null}
    </div>
  );

  const panels = tabs.map((tab) => (
    <div key={tab.key} hidden={tab.key !== active}>
      {tab.content}
    </div>
  ));

  if (fill) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {renderBar ? renderBar(bar) : <div className="shrink-0">{bar}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto pt-3">{panels}</div>
      </div>
    );
  }

  return (
    <div className={variant === "main" ? "space-y-4" : "space-y-3"}>
      {bar}
      {panels}
    </div>
  );
}
