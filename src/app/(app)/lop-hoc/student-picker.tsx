"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

export type StudentOption = { id: string; code: string; fullName: string };

/**
 * Chọn học viên để thêm vào lớp — mỗi học viên được chọn gửi lên một `studentIds`,
 * action đọc bằng `getAll`. Gói học phí nằm ở ô riêng bên dưới danh sách.
 */
export function StudentPicker({ students }: { students: StudentOption[] }) {
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const needle = keyword.trim().toLowerCase();
  const shown = needle
    ? students.filter(
        (student) =>
          student.fullName.toLowerCase().includes(needle) ||
          student.code.toLowerCase().includes(needle),
      )
    : students;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  if (students.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500">
        Mọi học viên đều đang học ở lớp này.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="Tìm theo tên hoặc mã học viên"
      />

      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {shown.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-slate-500">
            Không tìm thấy học viên nào.
          </li>
        ) : (
          shown.map((student) => (
            <li key={student.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(student.id)}
                  onChange={() => toggle(student.id)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="flex-1 font-medium text-slate-800">{student.fullName}</span>
                <span className="font-mono text-xs text-slate-400">{student.code}</span>
              </label>
            </li>
          ))
        )}
      </ul>

      <p className="text-xs text-slate-500">Đã chọn {selected.length} học viên.</p>

      {selected.map((id) => (
        <input key={id} type="hidden" name="studentIds" value={id} />
      ))}
    </div>
  );
}
