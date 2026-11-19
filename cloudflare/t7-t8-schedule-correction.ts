import type { DemoClass, DemoLessonSession } from "./operations-types";

export const T7_CLASS_ID = "class-import-t7";
export const T8_CLASS_ID = "class-import-t8";

/**
 * Vá lịch tháng 9/2026 của T7 & T8 sau khi đổi lịch ngày 07/09:
 *
 * - T7 04/09: buổi "phát sinh" do lịch mới lọt về trước mốc đổi — thực tế không
 *   diễn ra. Đánh nghỉ học vụ (ADMIN) nhưng giữ nguyên status COMPLETED và toàn
 *   bộ điểm danh để không làm lệch số liệu chuyên cần tháng 9.
 * - T7 13/09 & T8 23/09: hai buổi nghỉ thật đã được giáo viên điểm danh nhầm.
 *   Đánh "GV nghỉ — đã học bù" (offSource TEACHER + status SCHEDULED) — vẫn tính
 *   phí (đã thu và đã bù), rơi khỏi thống kê chuyên cần vì buổi bù mang điểm danh.
 * - Tạo buổi bù: T7 19/09 & T8 29/09 — "Buổi thêm", Hoàn thành, giờ giữ nguyên
 *   buổi gốc, copy y đúc điểm danh/điểm/cột nhập của buổi gốc. Học viên đã
 *   chuyển khỏi lớp không được copy.
 *
 * Tác động học phí: net-0 — buổi nghỉ học vụ gỡ khỏi cả phần thu lẫn phần tiêu;
 * buổi bù extra tự cân hai vế; buổi GV nghỉ vẫn tính phí như cũ.
 */

export const T7_PHANTOM_DATE = "2026-09-04";
export const T7_MAKEUP_DATE = "2026-09-19";
export const T7_ORIGINAL_DATE = "2026-09-13";
export const T8_MAKEUP_DATE = "2026-09-29";
export const T8_ORIGINAL_DATE = "2026-09-23";

/** Suất CN của T7 chỉ áp dụng từ ngày đổi lịch 07/09 — trước đó không có khung này. */
export function t7ScheduleEffectiveFrom(classes: DemoClass[]) {
  return classes.map((cls) => {
    if (cls.id !== T7_CLASS_ID) return cls;
    let changed = false;
    const schedules = (cls.schedules || []).map((slot) => {
      if (slot.weekday === 0 && !slot.effectiveFrom) {
        changed = true;
        return { ...slot, effectiveFrom: "2026-09-07" };
      }
      return slot;
    });
    return changed ? { ...cls, schedules } : cls;
  });
}

function findSession(sessions: DemoLessonSession[], classId: string, date: string, startTime?: string) {
  return sessions.find((item) => item.classId === classId
    && item.date === date
    && (startTime === undefined || item.startTime === startTime));
}

function makeupSessionId(classId: string, date: string) {
  return `session-makeup-${classId.replace("class-import-", "")}-${date}`;
}

/**
 * Trả về danh sách buổi học đã vá. Idempotent: gọi lại không nhân đôi buổi bù
 * và không ghi đè trạng thái đã vá.
 */
export function t7t8SeptemberMakeupSessions(
  sessions: DemoLessonSession[],
  classes: Pick<DemoClass, "id" | "studentIds">[],
) {
  const rosterOf = (classId: string) => new Set(classes.find((cls) => cls.id === classId)?.studentIds || []);
  const t7Roster = rosterOf(T7_CLASS_ID);
  const t8Roster = rosterOf(T8_CLASS_ID);

  const next = sessions.map((item) => {
    // 1. Buổi phát sinh T7 04/09: nghỉ học vụ — gỡ khỏi học phí, giữ điểm danh.
    if (item.classId === T7_CLASS_ID && item.date === T7_PHANTOM_DATE && !item.isOff) {
      const note = String(item.note || "").trim();
      return {
        ...item,
        isOff: true,
        offSource: "ADMIN" as const,
        note: note ? `${note} — Buổi phát sinh do đổi lịch, không diễn ra` : "Buổi phát sinh do đổi lịch, không diễn ra",
      };
    }
    // 2. Hai buổi gốc: GV nghỉ đã bù — vẫn tính phí, rơi khỏi chuyên cần.
    if (item.classId === T7_CLASS_ID && item.date === T7_ORIGINAL_DATE && !item.isOff) {
      return { ...item, isOff: true, offSource: "TEACHER" as const, status: "SCHEDULED" as const, note: `GV nghỉ — đã học bù ngày ${T7_MAKEUP_DATE}` };
    }
    if (item.classId === T8_CLASS_ID && item.date === T8_ORIGINAL_DATE && !item.isOff) {
      return { ...item, isOff: true, offSource: "TEACHER" as const, status: "SCHEDULED" as const, note: `GV nghỉ — đã học bù ngày ${T8_MAKEUP_DATE}` };
    }
    return item;
  });

  const created: DemoLessonSession[] = [];
  for (const spec of [
    { classId: T7_CLASS_ID, date: T7_MAKEUP_DATE, sourceDate: T7_ORIGINAL_DATE, roster: t7Roster },
    { classId: T8_CLASS_ID, date: T8_MAKEUP_DATE, sourceDate: T8_ORIGINAL_DATE, roster: t8Roster },
  ] as const) {
    const source = findSession(sessions, spec.classId, spec.sourceDate);
    if (!source) continue;
    // Giờ buổi gốc giữ nguyên cho buổi bù.
    const id = makeupSessionId(spec.classId, spec.date);
    if (next.some((item) => item.id === id || (item.classId === spec.classId && item.date === spec.date && item.startTime === source.startTime))) {
      continue;
    }
    created.push({
      id,
      classId: spec.classId,
      date: spec.date,
      startTime: source.startTime,
      endTime: source.endTime,
      teacherId: source.teacherId,
      roomId: source.roomId,
      status: "COMPLETED",
      isExtra: true,
      recurrenceKey: "",
      note: `Học bù buổi ${spec.sourceDate}`,
      isOff: false,
      hasHomework: source.hasHomework,
      assessmentColumns: source.assessmentColumns,
      attendanceColumnOrder: source.attendanceColumnOrder,
      // Chỉ copy điểm danh của học viên còn trong lớp — bạn đã chuyển lớp bỏ qua.
      attendance: (source.attendance || []).filter((row) => spec.roster.has(row.studentId)),
    });
  }

  return [...next, ...created];
}
