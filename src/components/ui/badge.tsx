import * as React from "react";

import { cn } from "@/lib/utils";

type Tone = "brand" | "green" | "amber" | "red" | "slate";

const tones: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Badge({
  className,
  tone = "slate",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        // whitespace-nowrap: nhãn luôn nằm gọn một hàng, không bị bẻ đôi trong ô bảng hẹp.
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Nhãn + màu cho các enum nghiệp vụ (PRD §5.4, §6.2, §9, §11.1) */
export const STATUS_TONE = {
  // ClassStatus
  DRAFT: { label: "Nháp", tone: "slate" },
  ACTIVE: { label: "Đang học", tone: "green" },
  PAUSED: { label: "Tạm dừng", tone: "amber" },
  FINISHED: { label: "Đã kết thúc", tone: "slate" },
  // StudentStatus
  UNASSIGNED: { label: "Chưa xếp lớp", tone: "slate" },
  STUDYING: { label: "Đang học", tone: "green" },
  RESERVED: { label: "Bảo lưu", tone: "amber" },
  DROPPED: { label: "Nghỉ học", tone: "red" },
  // SessionStatus
  SCHEDULED: { label: "Đã lên lịch", tone: "brand" },
  COMPLETED: { label: "Hoàn thành", tone: "green" },
  CANCELLED: { label: "Đã huỷ", tone: "red" },
  // AttendanceStatus — RESERVED dùng chung nhãn "Bảo lưu" với StudentStatus ở trên.
  PRESENT: { label: "Có mặt", tone: "green" },
  ABSENT: { label: "Vắng không phép", tone: "red" },
  EXCUSED: { label: "Vắng phép", tone: "amber" },
  // ClassType
  NORMAL: { label: "Lớp thường", tone: "brand" },
  IELTS: { label: "IELTS", tone: "amber" },
  // SyllabusStatus
  ARCHIVED: { label: "Lưu trữ", tone: "slate" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export function StatusBadge({ value }: { value: keyof typeof STATUS_TONE }) {
  const cfg = STATUS_TONE[value];
  if (!cfg) return <Badge>{value}</Badge>;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

/**
 * EnrollmentStatus có bảng nhãn riêng: các khoá trùng tên với StudentStatus
 * nhưng nói về một lần ghi danh cụ thể, và có thêm TRANSFERRED (PRD §6.3).
 */
export const ENROLLMENT_TONE = {
  ACTIVE: { label: "Đang học", tone: "green" },
  RESERVED: { label: "Bảo lưu", tone: "amber" },
  TRANSFERRED: { label: "Đã chuyển lớp", tone: "brand" },
  DROPPED: { label: "Nghỉ học", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export function EnrollmentBadge({ value }: { value: keyof typeof ENROLLMENT_TONE }) {
  const cfg = ENROLLMENT_TONE[value];
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}
