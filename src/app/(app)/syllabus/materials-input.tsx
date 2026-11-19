"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { type Material } from "./materials";

export type { Material } from "./materials";
export { parseMaterials } from "./materials";

/**
 * Danh sách học liệu `{ tiêu đề, link }` (PRD §4.6).
 *
 * Mỗi dòng là một cặp input trùng tên `materialTitle` / `materialUrl`;
 * Server Action đọc lại bằng `formData.getAll(...)` theo đúng thứ tự dòng.
 * Dòng để trống hoàn toàn sẽ bị bỏ qua khi lưu.
 */
export function MaterialsInput({ defaultValue }: { defaultValue: Material[] }) {
  const [rows, setRows] = useState<Material[]>(
    defaultValue.length > 0 ? defaultValue : [{ title: "", url: "" }],
  );

  function update(index: number, patch: Partial<Material>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <div className="hidden gap-2 sm:grid sm:grid-cols-[1fr_2fr_auto]">
        <Label>Tên học liệu</Label>
        <Label>Link</Label>
        <span className="w-9" />
      </div>

      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Input
            name="materialTitle"
            value={row.title}
            onChange={(e) => update(index, { title: e.target.value })}
            placeholder="PPTX"
          />
          <Input
            name="materialUrl"
            type="url"
            value={row.url}
            onChange={(e) => update(index, { url: e.target.value })}
            placeholder="https://drive.google.com/..."
          />
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
            className={`${buttonClass("outline", "icon")} sy-edit-only`}
            title="Bỏ dòng này"
            aria-label="Bỏ dòng này"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { title: "", url: "" }])}
        className={`${buttonClass("secondary", "sm")} sy-edit-only`}
      >
        <Plus className="h-4 w-4" />
        Thêm học liệu
      </button>
    </div>
  );
}
