import { prisma } from "@/lib/prisma";
import { addDaysUtc, todayUtc } from "@/lib/date";
import { TASK_HISTORY_START } from "@/lib/automatic-tasks";

export type StaffKpiRow = {
  userId: string;
  name: string;
  role: "TEACHER" | "ACADEMIC";
  onTime: number;
  total: number;
};

function deadlineOf(date: Date) {
  return addDaysUtc(date, 1);
}

function isOnTime(completedAt: Date | null | undefined, dueDate: Date) {
  return Boolean(completedAt && completedAt.getTime() < deadlineOf(dueDate).getTime());
}

function reviewComplete(
  attendances: { status: string; lessonRating: string | null; homeworkRating: string | null }[],
  hasHomework: boolean,
) {
  const present = attendances.filter((row) => row.status === "PRESENT");
  return (
    attendances.length > 0 &&
    present.every((row) => row.lessonRating && (!hasHomework || row.homeworkRating))
  );
}

function reviewFinishedAt(attendances: { status: string; lessonRating: string | null; homeworkRating: string | null; updatedAt: Date }[]) {
  const present = attendances.filter((row) => row.status === "PRESENT");
  if (present.length === 0) return attendances[0]?.updatedAt ?? null;
  return present.reduce((latest, row) => (row.updatedAt > latest ? row.updatedAt : latest), present[0].updatedAt);
}

/** KPI từ ngày trung tâm bắt đầu dùng app đến hôm nay: đúng hạn / tổng task đã đến hạn. */
export async function loadStaffKpi(): Promise<StaffKpiRow[]> {
  const today = todayUtc();
  const from = TASK_HISTORY_START;

  const [staff, sessions, generalTasks] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["TEACHER", "ACADEMIC"] } },
      orderBy: [{ fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        role: true,
        teacher: { select: { id: true } },
      },
    }),
    prisma.lessonSession.findMany({
      where: { date: { gte: from, lt: today }, status: { not: "CANCELLED" }, isOff: false },
      select: {
        date: true,
        status: true,
        completedAt: true,
        hasHomework: true,
        teacherId: true,
        academicStaffId: true,
        class: { select: { teacherId: true } },
        attendances: {
          select: { status: true, lessonRating: true, homeworkRating: true, updatedAt: true },
        },
      },
    }),
    prisma.generalTask.findMany({
      where: { endDate: { gte: from, lt: today } },
      select: { assigneeId: true, endDate: true, status: true, completedAt: true },
    }),
  ]);

  const teachers = staff.filter((user) => user.role === "TEACHER");
  const academics = staff.filter((user) => user.role === "ACADEMIC");

  const attendanceByAcademic = new Map<string, { onTime: number; total: number }>();
  const reviewByTeacher = new Map<string, { onTime: number; total: number }>();

  for (const session of sessions) {
    if (session.academicStaffId) {
      const attendance = attendanceByAcademic.get(session.academicStaffId) ?? { onTime: 0, total: 0 };
      attendance.total += 1;
      const attendanceDone = session.status === "COMPLETED" && session.attendances.length > 0;
      if (attendanceDone && isOnTime(session.completedAt, session.date)) attendance.onTime += 1;
      attendanceByAcademic.set(session.academicStaffId, attendance);
      // Buổi do Học vụ phụ trách không có KPI nhận xét Giáo viên.
      continue;
    }

    const teacherId = session.teacherId ?? session.class.teacherId;
    if (!teacherId) continue;
    const bucket = reviewByTeacher.get(teacherId) ?? { onTime: 0, total: 0 };
    bucket.total += 1;
    if (reviewComplete(session.attendances, session.hasHomework) && isOnTime(reviewFinishedAt(session.attendances), session.date)) {
      bucket.onTime += 1;
    }
    reviewByTeacher.set(teacherId, bucket);
  }

  const generalByUser = new Map<string, { onTime: number; total: number }>();
  for (const task of generalTasks) {
    const bucket = generalByUser.get(task.assigneeId) ?? { onTime: 0, total: 0 };
    bucket.total += 1;
    if (task.status === "COMPLETED" && isOnTime(task.completedAt, task.endDate)) bucket.onTime += 1;
    generalByUser.set(task.assigneeId, bucket);
  }

  const rows: StaffKpiRow[] = [];

  for (const user of teachers) {
    const review = user.teacher ? reviewByTeacher.get(user.teacher.id) : undefined;
    const general = generalByUser.get(user.id);
    rows.push({
      userId: user.id,
      name: user.fullName,
      role: "TEACHER",
      onTime: (review?.onTime ?? 0) + (general?.onTime ?? 0),
      total: (review?.total ?? 0) + (general?.total ?? 0),
    });
  }

  for (const user of academics) {
    const general = generalByUser.get(user.id);
    const attendance = attendanceByAcademic.get(user.id);
    rows.push({
      userId: user.id,
      name: user.fullName,
      role: "ACADEMIC",
      onTime: (attendance?.onTime ?? 0) + (general?.onTime ?? 0),
      total: (attendance?.total ?? 0) + (general?.total ?? 0),
    });
  }

  return rows.sort((a, b) => {
    const aPct = a.total === 0 ? -1 : a.onTime / a.total;
    const bPct = b.total === 0 ? -1 : b.onTime / b.total;
    if (aPct !== bPct) return bPct - aPct;
    return a.name.localeCompare(b.name, "vi");
  });
}
