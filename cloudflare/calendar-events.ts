/**
 * Lịch thêm (ngoài lịch lớp): Test speaking, Kèm speaking, Kèm hỗ trợ cá nhân,
 * Kèm hỗ trợ lớp, Dạy thay (buổi dạy thay không có trên lịch lớp — chấm công cột Dạy thay). Lưu riêng ở khóa "calendar-events:steps-demo" — không gắn
 * với lịch lớp, buổi học, học phí hay công nợ. Chỉ hiển thị trên Lịch dạy.
 */
export const CALENDAR_EVENTS_KEY = "calendar-events:steps-demo";

export const CALENDAR_EVENT_KINDS = ["TEST_SPEAKING", "KEM_SPEAKING", "KEM_CA_NHAN", "KEM_LOP", "DAY_THAY"] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];

export const CALENDAR_EVENT_LABELS: Record<CalendarEventKind, string> = {
  TEST_SPEAKING: "Test speaking",
  KEM_SPEAKING: "Kèm speaking",
  KEM_CA_NHAN: "Kèm hỗ trợ cá nhân",
  KEM_LOP: "Kèm hỗ trợ lớp",
  DAY_THAY: "Dạy thay",
};

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanCalendarEvents(rows: unknown): CalendarEvent[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: any) => {
    if (!row || typeof row !== "object" || !row.id) return [];
    if (!CALENDAR_EVENT_KINDS.includes(row.kind)) return [];
    return [{
      id: String(row.id),
      kind: row.kind,
      teacherId: String(row.teacherId || ""),
      date: String(row.date || ""),
      startTime: String(row.startTime || ""),
      endTime: String(row.endTime || ""),
      note: String(row.note || ""),
      createdAt: String(row.createdAt || ""),
      createdBy: String(row.createdBy || ""),
      ...(row.updatedAt ? { updatedAt: String(row.updatedAt) } : {}),
      ...(row.updatedBy ? { updatedBy: String(row.updatedBy) } : {}),
    }];
  });
}

/** Kiểm tra dữ liệu người dùng gửi lên; trả lỗi tiếng Việt hoặc bản đã làm sạch. */
export function validateCalendarEventInput(input: any, teacherIds: string[]):
  { error: string } | { value: Pick<CalendarEvent, "kind" | "teacherId" | "date" | "startTime" | "endTime" | "note"> } {
  const kind = String(input?.kind || "") as CalendarEventKind;
  if (!CALENDAR_EVENT_KINDS.includes(kind)) return { error: "Loại lịch không hợp lệ." };
  const teacherId = String(input?.teacherId || "").trim();
  if (!teacherId || !teacherIds.includes(teacherId)) return { error: "Hãy chọn giáo viên." };
  const date = String(input?.date || "").trim();
  if (!DATE_RE.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) return { error: "Ngày không hợp lệ." };
  const startTime = String(input?.startTime || "").trim();
  const endTime = String(input?.endTime || "").trim();
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return { error: "Giờ bắt đầu / kết thúc không hợp lệ." };
  if (endTime <= startTime) return { error: "Giờ kết thúc phải sau giờ bắt đầu." };
  const note = String(input?.note || "").trim().slice(0, 1000);
  return { value: { kind, teacherId, date, startTime, endTime, note } };
}

/** Hai khoảng giờ cùng ngày chồng nhau (chạm mép không tính là trùng). */
export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}
