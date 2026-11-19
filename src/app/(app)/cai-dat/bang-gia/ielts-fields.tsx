"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";

type Row = { key: number; id: string; name: string; basePrice: string; price: string };

/**
 * Form danh sách khóa IELTS: mỗi dòng một khóa (tên + học phí gốc + học phí trọn khóa).
 * Khóa mới thì `id` rỗng; bỏ dòng rồi lưu sẽ xóa khóa đó.
 */
export function IeltsCourseFields({
  initialRows,
}: {
  initialRows?: { id: string; name: string; basePrice: string; price: string }[];
}) {
  const nextKey = useRef(initialRows?.length ?? 1);
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows && initialRows.length > 0
      ? initialRows.map((row, index) => ({ key: index, ...row }))
      : [{ key: 0, id: "", name: "", basePrice: "", price: "" }],
  );

  function set(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <Field
      label="Danh sách khóa IELTS"
      hint="Lớp IELTS thu trọn khóa. Số tiền gõ kiểu 12.000.000 hoặc 12000000. Sửa giá không đổi hồ sơ đã lập."
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2">
          <Label className="mb-0 text-xs text-slate-500">Tên khóa</Label>
          <Label className="mb-0 text-xs text-slate-500">Học phí gốc (đ)</Label>
          <Label className="mb-0 text-xs text-slate-500">Học phí toàn khóa (đ)</Label>
          <span className="w-9" />
        </div>
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-2">
            <input type="hidden" name="courseId" value={row.id} />
            <Input
              name="courseName"
              required
              placeholder="IELTS Foundation"
              aria-label="Tên khóa IELTS"
              value={row.name}
              onChange={(event) => set(row.key, { name: event.target.value })}
            />
            <Input
              name="baseCoursePrice"
              inputMode="numeric"
              placeholder="12.000.000"
              aria-label="Học phí gốc"
              value={row.basePrice}
              onChange={(event) => set(row.key, { basePrice: event.target.value })}
            />
            <Input
              name="coursePrice"
              inputMode="numeric"
              required
              placeholder="12.000.000"
              aria-label="Học phí toàn khóa"
              value={row.price}
              onChange={(event) => set(row.key, { price: event.target.value })}
            />
            <button
              type="button"
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              title="Bỏ khóa này"
              aria-label="Bỏ khóa này"
              className={buttonClass("ghost", "icon", "shrink-0")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: (nextKey.current += 1), id: "", name: "", basePrice: "", price: "" },
            ])
          }
          className={buttonClass("secondary", "md")}
        >
          <Plus className="h-4 w-4" />
          Thêm khóa
        </button>
      </div>
    </Field>
  );
}

