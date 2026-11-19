import { prisma } from "@/lib/prisma";
import { addDaysUtc, todayUtc, utcDate } from "@/lib/date";
import type { ClassType } from "@/generated/prisma/enums";

export type AutomaticTaskKind = "ATTENDANCE" | "TEACHER_REVIEW";

export type AutomaticTask = {
  id: string;
  kind: AutomaticTaskKind;
  sessionId: string;
  classId: string;
  className: string;
  classType: ClassType;
  startTime: string;
  endTime: string;
  date: Date;
  assignee: string;
  assigneeId?: string;
  completed: boolean;
  overdue: boolean;
  href: string;
};

/** Giữ task quá hạn trong khoảng này để nhật ký hôm qua (và vài ngày gần đây) không biến mất. */
const DEFAULT_LOOKBACK_DAYS = 30;

/** Trung tâm bắt đầu dùng app từ ngày này — không tạo task quá hạn cho buổi trước đó. */
export const TASK_HISTORY_START = utcDate(2026, 7, 23);

export async function getTodayAutomaticTasks(options?: {
  teacherId?: string;
  includeAttendance?: boolean;
  includeTeacherReview?: boolean;
  lookbackDays?: number;
  from?: Date;
  to?: Date;
  classId?: string;
  classType?: ClassType;
}) {
  const includeAttendance = options?.includeAttendance ?? true;
  const includeTeacherReview = options?.includeTeacherReview ?? true;
  const teacherId = options?.teacherId;
  const today = todayUtc();
  const lookbackFrom = addDaysUtc(today, -(options?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS));
  const floor = lookbackFrom.getTime() < TASK_HISTORY_START.getTime() ? TASK_HISTORY_START : lookbackFrom;
  const requestedFrom = options?.from ?? floor;
  const requestedTo = options?.to ?? today;
  const from = requestedFrom.getTime() < TASK_HISTORY_START.getTime() ? TASK_HISTORY_START : requestedFrom;
  const to = requestedTo.getTime() > today.getTime() ? today : requestedTo;
  const rangeStart = from.getTime() <= to.getTime() ? from : to;
  const rangeEnd = from.getTime() <= to.getTime() ? to : from;

  const sessions = await prisma.lessonSession.findMany({
    where: {
      date: { gte: rangeStart, lte: rangeEnd },
      status: { not: "CANCELLED" },
      isOff: false,
      ...(teacherId
        ? {
            OR: [
              { teacherId },
              { teacherId: null, academicStaffId: null, class: { teacherId } },
            ],
          }
        : {}),
      ...(options?.classId
        ? { classId: options.classId }
        : options?.classType
          ? { class: { type: options.classType } }
          : {}),
    },
    orderBy: [{ date: "desc" }, { startTime: "asc" }, { class: { name: "asc" } }],
    select: {
      id: true,
      classId: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      hasHomework: true,
      academicStaffId: true,
      academicStaff: { select: { id: true, fullName: true } },
      class: {
        select: {
          name: true,
          type: true,
          teacher: { select: { user: { select: { id: true, fullName: true } } } },
        },
      },
      teacher: { select: { user: { select: { id: true, fullName: true } } } },
      attendances: {
        select: { status: true, lessonRating: true, homeworkRating: true },
      },
    },
  });

  const tasks: AutomaticTask[] = [];
  for (const session of sessions) {
    const href = `/lop-hoc/${session.classId}?tab=diem-danh&buoi=${session.id}`;
    const overdue = session.date.getTime() < today.getTime();
    if (includeAttendance) {
      const completed = session.status === "COMPLETED" && session.attendances.length > 0;
      tasks.push({
        id: `attendance:${session.id}`,
        kind: "ATTENDANCE",
        sessionId: session.id,
        classId: session.classId,
        className: session.class.name,
        classType: session.class.type,
        startTime: session.startTime,
        endTime: session.endTime,
        date: session.date,
        assignee: session.academicStaff?.fullName ?? "Học vụ",
        assigneeId: session.academicStaff?.id,
        completed,
        overdue: overdue && !completed,
        href,
      });
    }

    if (includeTeacherReview && !session.academicStaffId) {
      const presentRows = session.attendances.filter((row) => row.status === "PRESENT");
      const completed =
        session.attendances.length > 0 &&
        presentRows.every(
          (row) => row.lessonRating && (!session.hasHomework || row.homeworkRating),
        );
      if (!overdue || !completed) {
        tasks.push({
          id: `review:${session.id}`,
          kind: "TEACHER_REVIEW",
          sessionId: session.id,
          classId: session.classId,
          className: session.class.name,
          classType: session.class.type,
          startTime: session.startTime,
          endTime: session.endTime,
          date: session.date,
          assignee: session.teacher?.user.fullName ?? session.class.teacher?.user.fullName ?? "Chưa phân công",
          assigneeId: session.teacher?.user.id ?? session.class.teacher?.user.id,
          completed,
          overdue: overdue && !completed,
          href,
        });
      }
    }
  }

  tasks.sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime();
    if (byDate !== 0) return byDate;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "ATTENDANCE" ? -1 : 1;
    return a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className);
  });

  return tasks;
}
