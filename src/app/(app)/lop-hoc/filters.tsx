"use client";

import { useRef } from "react";

import { Field, Input, Select } from "@/components/ui/input";

/**
 * Bộ lọc của danh sách lớp. Không có nút Lọc: chọn ở ô nào là gửi form ngay,
 * riêng ô tìm kiếm gõ xong bấm Enter.
 */
export function ClassFilters({
  q,
  type,
  branch,
  branches,
}: {
  q: string;
  type: string;
  branch: string;
  branches: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form
      ref={formRef}
      method="get"
      className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]"
    >
      <Field label="Tìm kiếm">
        <Input name="q" defaultValue={q} placeholder="Tên hoặc mã lớp, gõ xong bấm Enter..." />
      </Field>
      <Field label="Loại lớp">
        <Select name="type" defaultValue={type} onChange={submit}>
          <option value="">Tất cả</option>
          <option value="NORMAL">Lớp thường</option>
          <option value="IELTS">IELTS</option>
        </Select>
      </Field>
      <Field label="Chi nhánh">
        <Select name="branch" defaultValue={branch} onChange={submit}>
          <option value="">Tất cả</option>
          {branches.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
    </form>
  );
}
