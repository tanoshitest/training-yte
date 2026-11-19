"use client";

import { usePathname, useRouter } from "next/navigation";

import { Select } from "@/components/ui/input";
import type { PortalStudentOption } from "@/lib/portal-data";

export function PortalStudentPicker({
  options,
  selectedId,
}: {
  options: PortalStudentOption[];
  selectedId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="mb-6">
      <label className="mb-1.5 block text-sm font-semibold text-slate-800">Xem portal của học viên</label>
      <Select
        value={selectedId ?? ""}
        onChange={(event) => {
          const id = event.target.value;
          router.push(id ? `${pathname}?studentId=${encodeURIComponent(id)}` : pathname);
        }}
        className="max-w-md"
      >
        <option value="">— Chọn học viên để xem Portal —</option>
        {options.map((student) => (
          <option key={student.id} value={student.id}>
            {student.name} ({student.code})
          </option>
        ))}
      </Select>
    </div>
  );
}
