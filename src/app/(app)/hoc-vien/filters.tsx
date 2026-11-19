"use client";

import { Field, Input, Select } from "@/components/ui/input";
import { FilterForm } from "@/components/ui/filter-form";
import { STATUS_TONE } from "@/components/ui/badge";
import type { StudentStatus } from "@/generated/prisma/enums";

const STATUSES: StudentStatus[] = ["UNASSIGNED", "STUDYING", "RESERVED", "DROPPED"];

/**
 * Bộ lọc danh sách học viên. Chọn trạng thái / lớp là lọc ngay; ô tìm kiếm gõ xong Enter.
 */
export function StudentFilters({
  q,
  status,
  classId,
  classes,
}: {
  q: string;
  status: string;
  classId: string;
  classes: { id: string; code: string; name: string }[];
}) {
  return (
    <FilterForm className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.4fr]">
      <Field label="Tìm kiếm">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Tên, mã học viên hoặc SĐT phụ huynh, gõ xong bấm Enter..."
        />
      </Field>
      <Field label="Trạng thái">
        <Select name="status" defaultValue={status}>
          <option value="">Tất cả</option>
          {STATUSES.map((key) => (
            <option key={key} value={key}>
              {STATUS_TONE[key].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lớp">
        <Select name="class" defaultValue={classId}>
          <option value="">Tất cả lớp</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.code})
            </option>
          ))}
        </Select>
      </Field>
    </FilterForm>
  );
}
