import { prisma } from "@/lib/prisma";
import { timeToMinutes } from "@/lib/utils";

export const PAYROLL_RATE_PER_HOUR = 350000;
export const PAYROLL_COMMISSION_PER_SESSION = 50000;
export const PAYROLL_TAX_RATE = 0.1;

export type TimesheetSession = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  isOff: boolean;
  sequence: number;
  teacherId: string | null;
  classTeacherId: string | null;
  classId: string;
  classCode: string;
  className: string;
  roomName: string | null;
  lessonName: string | null;
  present: number;
  attendanceCount: number;
};

export type TeacherTimesheetRow = {
  teacherId: string;
  code: string;
  name: string;
  payableSessions: number;
  minutes: number;
  hours: number;
  off: number;
  cancelled: number;
  scheduled: number;
};

export type PayrollRow = TeacherTimesheetRow & {
  baseSalary: number;
  commission: number;
  tax: number;
  net: number;
};

export function sessionMinutes(startTime: string, endTime: string) {
  return Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime));
}

export function assignedTeacherId(session: { teacherId: string | null; classTeacherId: string | null }) {
  return session.teacherId || session.classTeacherId;
}

export function isPayableSession(session: { status: string; isOff: boolean }) {
  return session.status === "COMPLETED" && !session.isOff;
}

export async function loadTimesheetSessions(start: Date, end: Date, teacherId = "") {
  const sessions = await prisma.lessonSession.findMany({
    where: {
      date: { gte: start, lte: end },
      academicStaffId: null,
      ...(teacherId
        ? {
            OR: [
              { teacherId },
              { teacherId: null, class: { teacherId } },
            ],
          }
        : {}),
    },
    orderBy: [{ date: "desc" }, { startTime: "desc" }, { class: { name: "asc" } }],
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      sequence: true,
      isOff: true,
      teacherId: true,
      class: { select: { id: true, code: true, name: true, teacherId: true } },
      room: { select: { name: true } },
      syllabusLesson: { select: { name: true } },
      attendances: { select: { status: true } },
    },
  });

  return sessions.map((session): TimesheetSession => ({
    id: session.id,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    status: session.status,
    isOff: session.isOff,
    sequence: session.sequence,
    teacherId: session.teacherId,
    classTeacherId: session.class.teacherId,
    classId: session.class.id,
    classCode: session.class.code,
    className: session.class.name,
    roomName: session.room?.name ?? null,
    lessonName: session.syllabusLesson?.name ?? null,
    present: session.attendances.filter((row) => row.status === "PRESENT").length,
    attendanceCount: session.attendances.length,
  }));
}

export async function loadTimesheetTeachers() {
  return prisma.teacher.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, user: { select: { fullName: true } } },
  });
}

export function summarizeByTeacher(
  sessions: TimesheetSession[],
  teachers: Array<{ id: string; code: string; user: { fullName: string } }>,
): TeacherTimesheetRow[] {
  const byTeacher = new Map<string, TeacherTimesheetRow>();
  for (const teacher of teachers) {
    byTeacher.set(teacher.id, {
      teacherId: teacher.id,
      code: teacher.code,
      name: teacher.user.fullName,
      payableSessions: 0,
      minutes: 0,
      hours: 0,
      off: 0,
      cancelled: 0,
      scheduled: 0,
    });
  }

  for (const session of sessions) {
    const teacherId = assignedTeacherId(session);
    if (!teacherId) continue;
    const row = byTeacher.get(teacherId);
    if (!row) continue;
    if (isPayableSession(session)) {
      row.payableSessions += 1;
      row.minutes += sessionMinutes(session.startTime, session.endTime);
    } else if (session.isOff) {
      row.off += 1;
    } else if (session.status === "CANCELLED") {
      row.cancelled += 1;
    } else {
      row.scheduled += 1;
    }
  }

  return [...byTeacher.values()]
    .filter((row) => row.payableSessions + row.off + row.cancelled + row.scheduled > 0)
    .map((row) => ({ ...row, hours: row.minutes / 60 }));
}

export function payrollFromTimesheet(rows: TeacherTimesheetRow[]): PayrollRow[] {
  return rows
    .filter((row) => row.payableSessions > 0)
    .map((row) => {
      const baseSalary = Math.round(row.hours * PAYROLL_RATE_PER_HOUR);
      const commission = row.payableSessions * PAYROLL_COMMISSION_PER_SESSION;
      const tax = Math.round((baseSalary + commission) * PAYROLL_TAX_RATE);
      return { ...row, baseSalary, commission, tax, net: baseSalary + commission - tax };
    });
}
