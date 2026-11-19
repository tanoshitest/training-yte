"use client";

import { Field } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";

export function FileField({
  label,
  hint,
  accept,
  fileName,
  onPick,
  onClear,
}: {
  label: string;
  hint?: string;
  accept: string;
  fileName: string;
  onPick: (name: string, url: string) => void;
  onClear: () => void;
}) {
  return (
    <Field label={label} hint={hint ?? (fileName ? fileName : "Chưa chọn file. Chỉ lưu trên trình duyệt.")}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept={accept}
          className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            onPick(file.name, URL.createObjectURL(file));
          }}
        />
        {fileName ? (
          <button type="button" onClick={onClear} className={buttonClass("ghost", "sm")}>
            Xóa file
          </button>
        ) : null}
      </div>
    </Field>
  );
}
