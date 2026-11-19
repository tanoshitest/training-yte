"use client";

import { useRef } from "react";

import { Select } from "@/components/ui/input";

type Option = { value: string; label: string };

/**
 * Bộ lọc lịch dạy. Không có nút Lọc / Xoá lọc: chọn xong là gửi form ngay,
 * chọn lại mục "Tất cả …" chính là bỏ lọc.
 *
 * `view` và `date` đi kèm dạng hidden để đổi bộ lọc không nhảy về tuần hiện tại.
 */
export function CalendarFilters({
  action,
  view,
  date,
  groups,
  hidden,
}: {
  action: string;
  view: string;
  date: string;
  groups: { name: string; value: string; all: string; options: Option[] }[];
  /** Tham số GET cần giữ khi đổi bộ lọc (ví dụ `tab` trên hồ sơ giáo viên). */
  hidden?: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      method="get"
      className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto"
    >
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="date" value={date} />
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      {groups.map((group) => (
        <Select
          key={group.name}
          name={group.name}
          defaultValue={group.value}
          aria-label={group.all}
          className="h-8 w-auto min-w-[9rem] py-1 text-xs"
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">{group.all}</option>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ))}
    </form>
  );
}
