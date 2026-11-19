"use client";

import { useState } from "react";
import { CalendarOff, ChevronDown, LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";

export type OffDaySessionOption = {
  id: string;
  label: string;
  isOff: boolean;
  locked: boolean;
};

/** Dropdown checkbox chọn nhiều buổi nghỉ trong modal cấu hình của lớp. */
export function ClassOffDaysPicker({ sessions }: { sessions: OffDaySessionOption[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() =>
    new Set(sessions.filter((session) => session.isOff).map((session) => session.id)),
  );

  const selectedCount = sessions.filter((session) => selected.has(session.id)).length;

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
        Chưa có buổi sắp tới nào được sinh từ thời khoá biểu. Hãy lưu thời khoá biểu lớp trước.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions
        .filter((session) => !session.locked && selected.has(session.id))
        .map((session) => (
          <input key={session.id} type="hidden" name="offSessionIds" value={session.id} />
        ))}
      <p className="text-sm text-slate-600">
        Tick các ngày cả lớp nghỉ. Buổi nghỉ vẫn hiện trên lịch nhưng không điểm danh, không trừ học phí.
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
        >
          <CalendarOff className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">
            Chọn buổi nghỉ theo thời khoá biểu
          </span>
          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {selectedCount}/{sessions.length} đã chọn
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
          />
        </button>

        {open ? (
          <div className="max-h-80 overflow-y-auto border-t border-slate-200">
            {sessions.map((session) => (
              <label
                key={session.id}
                className={cn(
                  "flex items-start gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0",
                  session.locked ? "cursor-not-allowed bg-slate-50" : "cursor-pointer hover:bg-brand-50/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(session.id)}
                  disabled={session.locked}
                  onChange={(event) => toggle(session.id, event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-800">{session.label}</span>
                  {session.locked ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                      <LockKeyhole className="h-3 w-3" />
                      Buổi đã có điểm danh, điểm kiểm tra, báo cáo hoặc học phí — sửa tại chi tiết buổi.
                    </span>
                  ) : session.isOff ? (
                    <span className="mt-0.5 block text-xs font-medium text-amber-700">Đang nghỉ học</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
