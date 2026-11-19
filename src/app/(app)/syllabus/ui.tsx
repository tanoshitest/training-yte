import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/form";
import { Select } from "@/components/ui/input";
import type { ActionState } from "@/lib/form-utils";
import { cn } from "@/lib/utils";
import type { SyllabusStatus } from "@/generated/prisma/enums";

/**
 * Nhãn riêng cho trạng thái Syllabus — không dùng `STATUS_TONE` chung
 * vì ở đó `ACTIVE` mang nghĩa "Đang học" của lớp.
 */
export const SYLLABUS_STATUS = {
  DRAFT: { label: "Nháp", tone: "slate" },
  ACTIVE: { label: "Đang dùng", tone: "green" },
  ARCHIVED: { label: "Lưu trữ", tone: "amber" },
} as const;

export function SyllabusBadge({ value }: { value: SyllabusStatus }) {
  const cfg = SYLLABUS_STATUS[value];
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

export function StatusSelect({ defaultValue = "DRAFT" }: { defaultValue?: SyllabusStatus }) {
  return (
    <Select name="status" defaultValue={defaultValue}>
      {(Object.keys(SYLLABUS_STATUS) as SyllabusStatus[]).map((key) => (
        <option key={key} value={key}>
          {SYLLABUS_STATUS[key].label}
        </option>
      ))}
    </Select>
  );
}

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form một nút bấm (đổi thứ tự, xoá, nhân bản).
 * Mỗi thao tác phải là một `<form>` riêng vì HTML không cho lồng form.
 */
export function TinyForm({
  action,
  fields,
  children,
  className,
}: {
  action: Action;
  fields: Record<string, string>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ActionForm action={action} className={cn("flex flex-wrap items-center gap-1", className)}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </ActionForm>
  );
}

export function LevelSelect({
  levels,
  defaultValue,
  includeEmpty = "— Không gắn cấp học —",
}: {
  levels: { id: string; name: string; isActive: boolean }[];
  defaultValue?: string | null;
  includeEmpty?: string;
}) {
  return (
    <Select name="levelId" defaultValue={defaultValue ?? ""}>
      <option value="">{includeEmpty}</option>
      {levels.map((level) => (
        <option key={level.id} value={level.id}>
          {level.name}
          {level.isActive ? "" : " (ngưng)"}
        </option>
      ))}
    </Select>
  );
}
