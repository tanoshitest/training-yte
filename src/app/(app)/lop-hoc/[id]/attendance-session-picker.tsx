"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Option = {
  id: string;
  label: string;
  disabled?: boolean;
};

export function AttendanceSessionPicker({
  classId,
  currentId,
  options,
}: {
  classId: string;
  currentId: string;
  options: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <select
      value={currentId}
      onChange={(event) => {
        const next = new URLSearchParams(searchParams.toString());
        next.set("tab", "diem-danh");
        next.set("buoi", event.target.value);
        router.push(`/lop-hoc/${classId}?${next.toString()}`);
      }}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-brand-500 sm:w-[26rem]"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
