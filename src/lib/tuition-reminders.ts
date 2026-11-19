import { prisma } from "@/lib/prisma";
import { remainingSessions } from "@/lib/tuition";
import { addDaysUtc } from "@/lib/date";
import { startOfDay } from "@/lib/utils";
import type { TuitionMilestone, TuitionReminderPackage, TuitionReminderTask } from "@/lib/tuition-reminder-types";
import { currentMilestone } from "@/lib/tuition-reminder-types";

export type { TuitionMilestone, TuitionReminderPackage, TuitionReminderTask };
export { currentMilestone, milestoneLabel, reminderTaskName, TUITION_MILESTONES } from "@/lib/tuition-reminder-types";

type PkgRow = TuitionReminderPackage & { levelId: string; subLevelId: string | null };

function classPackages(all: PkgRow[], subLevelId: string | null, levelId: string | null) {
  const bySub = subLevelId ? all.filter((pkg) => pkg.subLevelId === subLevelId) : [];
  if (bySub.length > 0) return bySub;
  const byLevel = levelId ? all.filter((pkg) => pkg.levelId === levelId) : [];
  return byLevel;
}

export async function getTuitionReminderTasks(options?: {
  from?: Date;
  to?: Date;
  classId?: string;
}) {
  const rangeStart = options?.from;
  const rangeEnd = options?.to;
  const until = rangeEnd ? addDaysUtc(rangeEnd, 1) : null;

  const [enrollments, allPackages, reminders] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        status: "ACTIVE",
        class: {
          type: "NORMAL",
          ...(options?.classId ? { id: options.classId } : {}),
        },
      },
      select: {
        id: true,
        studentId: true,
        classId: true,
        joinedAt: true,
        student: {
          select: { code: true, fullName: true, parentName: true, parentPhone: true },
        },
        class: { select: { name: true, levelId: true, subLevelId: true } },
        tuition: {
          select: { type: true, totalSessions: true, usedSessions: true },
        },
      },
    }),
    prisma.normalPackage.findMany({
      where: { isActive: true },
      orderBy: { totalSessions: "asc" },
      select: {
        id: true,
        name: true,
        totalSessions: true,
        price: true,
        levelId: true,
        subLevelId: true,
      },
    }),
    prisma.tuitionReminder.findMany({
      select: {
        enrollmentId: true,
        milestone: true,
        round: true,
        cycleKey: true,
        remaining: true,
        remindedAt: true,
      },
    }),
  ]);

  const pendingClassIds = [
    ...new Set(enrollments.filter((item) => !item.tuition).map((item) => item.classId)),
  ];
  const completedSessions =
    pendingClassIds.length > 0
      ? await prisma.lessonSession.findMany({
          where: { classId: { in: pendingClassIds }, status: "COMPLETED" },
          select: { classId: true, date: true },
        })
      : [];

  const reminderKey = (enrollmentId: string, milestone: number, cycleKey: number) =>
    `${enrollmentId}:${milestone}:${cycleKey}`;
  const reminded = new Map(
    reminders.map((row) => [reminderKey(row.enrollmentId, row.milestone, row.cycleKey), row]),
  );
  const roundsByCycle = new Map<string, number>();
  for (const row of reminders) {
    const key = `${row.enrollmentId}:${row.cycleKey}`;
    roundsByCycle.set(key, Math.max(roundsByCycle.get(key) ?? 0, row.round));
  }

  const pkgRows: PkgRow[] = allPackages.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    totalSessions: pkg.totalSessions,
    price: pkg.price.toString(),
    levelId: pkg.levelId,
    subLevelId: pkg.subLevelId,
  }));

  const open: TuitionReminderTask[] = [];
  const done: TuitionReminderTask[] = [];

  for (const item of enrollments) {
    const remaining = item.tuition
      ? (remainingSessions(item.tuition) ?? (item.tuition.totalSessions ?? 0) - item.tuition.usedSessions)
      : 0 -
        completedSessions.filter(
          (session) =>
            session.classId === item.classId &&
            session.date.getTime() >= startOfDay(item.joinedAt).getTime(),
        ).length;
    const cycleKey = item.tuition?.totalSessions ?? 0;
    const packages = classPackages(pkgRows, item.class.subLevelId, item.class.levelId).map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      totalSessions: pkg.totalSessions,
      price: pkg.price,
    }));
    const base = {
      enrollmentId: item.id,
      studentId: item.studentId,
      studentName: item.student.fullName,
      studentCode: item.student.code,
      parentName: item.student.parentName,
      parentPhone: item.student.parentPhone,
      classId: item.classId,
      className: item.class.name,
      remaining,
      cycleKey,
      packages,
    };

    const milestone = currentMilestone(remaining);
    if (milestone != null) {
      const logged = reminded.get(reminderKey(item.id, milestone, cycleKey));
      if (!logged) {
        open.push({
          ...base,
          milestone,
          round: (roundsByCycle.get(`${item.id}:${cycleKey}`) ?? 0) + 1,
          completed: false,
          overdue: remaining <= 0,
          remindedAt: null,
        });
      }
    }

    for (const row of reminders.filter((itemRow) => itemRow.enrollmentId === item.id)) {
      if (rangeStart && row.remindedAt.getTime() < rangeStart.getTime()) continue;
      if (until && row.remindedAt.getTime() >= until.getTime()) continue;
      done.push({
        ...base,
        remaining: row.remaining,
        milestone: row.milestone as TuitionMilestone,
        round: row.round,
        cycleKey: row.cycleKey,
        completed: true,
        overdue: false,
        remindedAt: row.remindedAt.toISOString(),
        packages,
      });
    }
  }

  return { open, done };
}
