import { prisma } from "@/lib/prisma";
import { formatDateUtc } from "@/lib/date";
import type { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus, HomeworkRating, LessonRating } from "@/generated/prisma/enums";

/**
 * Nghiệp vụ buổi học — PRD §7, §8, §9.
 *
 * R12 — sửa Ngày / Giờ / Phòng / Giáo viên **không** làm đổi `syllabusLessonId`:
 *       mọi hàm ở đây đều không đụng tới trường đó.
 */

export type SessionConflict = {
  kind: "room" | "teacher" | "academic";
  label: string;
};

type ConflictQuery = {
  date: Date;
  startTime: string;
  endTime: string;
  roomId?: string | null;
  teacherId?: string | null;
  academicStaffId?: string | null;
  excludeId?: string | null;
};

/**
 * Tìm buổi học khác dùng trùng phòng hoặc trùng giáo viên trong cùng khung giờ.
 *
 * Giờ lưu dạng `"HH:mm"` có đệm số 0 nên so sánh chuỗi cũng chính là so sánh thời gian —
 * điều kiện giao nhau là `start < otherEnd && end > otherStart`.
 * Buổi đã huỷ không tính là xung đột (R7).
 */
export async function findSessionConflicts(
  client: Prisma.TransactionClient | typeof prisma,
  { date, startTime, endTime, roomId, teacherId, academicStaffId, excludeId }: ConflictQuery,
): Promise<SessionConflict[]> {
  const targets: Prisma.LessonSessionWhereInput[] = [];
  if (roomId) targets.push({ roomId });
  if (teacherId) targets.push({ teacherId });
  if (academicStaffId) targets.push({ academicStaffId });
  if (targets.length === 0) return [];

  const overlapping = await client.lessonSession.findMany({
    where: {
      date,
      status: { not: "CANCELLED" },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      OR: targets,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      roomId: true,
      teacherId: true,
      academicStaffId: true,
      class: { select: { name: true } },
      room: { select: { name: true } },
      teacher: { select: { user: { select: { fullName: true } } } },
      academicStaff: { select: { fullName: true } },
    },
    take: 20,
  });

  const conflicts: SessionConflict[] = [];
  for (const other of overlapping) {
    const when = `${formatDateUtc(date)} ${other.startTime}–${other.endTime}`;
    if (roomId && other.roomId === roomId) {
      conflicts.push({
        kind: "room",
        label: `Phòng ${other.room?.name ?? "?"} đã có lớp ${other.class.name} lúc ${when}`,
      });
    }
    if (teacherId && other.teacherId === teacherId) {
      conflicts.push({
        kind: "teacher",
        label: `Giáo viên ${other.teacher?.user.fullName ?? "?"} đang dạy lớp ${other.class.name} lúc ${when}`,
      });
    }
    if (academicStaffId && other.academicStaffId === academicStaffId) {
      conflicts.push({
        kind: "academic",
        label: `Học vụ ${other.academicStaff?.fullName ?? "?"} đang phụ trách lớp ${other.class.name} lúc ${when}`,
      });
    }
  }
  return conflicts;
}

/** Số thứ tự buổi kế tiếp của lớp — `@@unique([classId, sequence])` nên phải lấy max hiện có. */
export async function nextSequence(
  client: Prisma.TransactionClient | typeof prisma,
  classId: string,
) {
  const last = await client.lessonSession.findFirst({
    where: { classId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (last?.sequence ?? 0) + 1;
}

export type SessionTestColumn = {
  id: string;
  name: string;
  scores: Record<string, number>;
};

/** Đọc JSON cột kiểm tra trên buổi — bỏ qua phần tử hỏng để trang không sập. */
export function parseTestColumns(value: unknown): SessionTestColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || typeof row.name !== "string") return [];
    const name = row.name.trim().slice(0, 40);
    if (!name) return [];
    const scores: Record<string, number> = {};
    if (row.scores && typeof row.scores === "object" && !Array.isArray(row.scores)) {
      for (const [studentId, raw] of Object.entries(row.scores as Record<string, unknown>)) {
        const score = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(",", ".")) : NaN;
        if (Number.isFinite(score)) scores[studentId] = Math.round(score * 10) / 10;
      }
    }
    return [{ id: row.id, name, scores }];
  });
}

export type RosterRow = {
  studentId: string;
  code: string;
  fullName: string;
  /** Chưa điểm danh thì để trống, không mặc định thành Có mặt. */
  status: AttendanceStatus | null;
  lessonRating: LessonRating | null;
  homeworkRating: HomeworkRating | null;
  pronunciationVideoDone: boolean;
  note: string | null;
  /** Còn học ở lớp không — học viên đã rời lớp chỉ để xem lại, không điểm danh nữa. */
  inClass: boolean;
  /** Đang bảo lưu lớp này — điểm danh bị đóng băng ở "Bảo lưu" và không trừ buổi. */
  reserved: boolean;
};

/** Học viên trong lớp kèm trạng thái ghi danh, dùng để dựng bảng điểm danh. */
export type RosterStudent = {
  id: string;
  code: string;
  fullName: string;
  /** Lần ghi danh đang bảo lưu — lấy từ `Enrollment.status === "RESERVED"`. */
  reserved: boolean;
};

/**
 * Danh sách điểm danh của một buổi: luôn đủ học viên đang học của lớp, kể cả buổi
 * giáo viên chưa điểm danh — bảng rỗng thì nhìn không biết lớp có những ai. Học viên
 * đang bảo lưu vẫn hiện để thấy rõ vì sao buổi này không trừ tiền của họ.
 *
 * Học viên đã rời lớp nhưng còn bản ghi điểm danh của buổi cũ được nối ở cuối, để
 * lịch sử đã ghi không biến mất khỏi bảng.
 */
export function attendanceRoster(
  students: RosterStudent[],
  attendances: {
    status: AttendanceStatus;
    lessonRating: LessonRating | null;
    homeworkRating: HomeworkRating | null;
    pronunciationVideoDone: boolean;
    note: string | null;
    student: { id: string; code: string; fullName: string };
  }[],
): RosterRow[] {
  const marked = new Map(attendances.map((item) => [item.student.id, item]));
  const inClass = new Set(students.map((student) => student.id));

  return [
    ...students.map((student) => ({
      studentId: student.id,
      code: student.code,
      fullName: student.fullName,
      status: marked.get(student.id)?.status ?? null,
      lessonRating: marked.get(student.id)?.lessonRating ?? null,
      homeworkRating: marked.get(student.id)?.homeworkRating ?? null,
      pronunciationVideoDone: marked.get(student.id)?.pronunciationVideoDone ?? false,
      note: marked.get(student.id)?.note ?? null,
      inClass: true,
      reserved: student.reserved,
    })),
    ...attendances
      .filter((item) => !inClass.has(item.student.id))
      .map((item) => ({
        studentId: item.student.id,
        code: item.student.code,
        fullName: item.student.fullName,
        status: item.status,
        lessonRating: item.lessonRating ?? null,
        homeworkRating: item.homeworkRating ?? null,
        pronunciationVideoDone: item.pronunciationVideoDone ?? false,
        note: item.note,
        inClass: false,
        reserved: false,
      })),
  ];
}

/** Màn điểm danh / nhận xét của lớp — giáo viên và học vụ dùng chung. */
export function classAttendanceHref(classId: string, sessionId?: string) {
  const params = new URLSearchParams({ tab: "diem-danh" });
  if (sessionId) params.set("buoi", sessionId);
  return `/lop-hoc/${classId}?${params.toString()}`;
}
