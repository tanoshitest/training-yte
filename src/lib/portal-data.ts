import { prisma } from "@/lib/prisma";
import { addDaysUtc, parseDateInput, startOfWeekUtc, todayUtc } from "@/lib/date";
import { effectiveRole } from "@/lib/roles";
import { WEEKDAY_SHORT } from "@/lib/utils";
import type { Role } from "@/generated/prisma/enums";

export type PortalViewer = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  studentId: string | null;
};

export type PortalStudentOption = {
  id: string;
  code: string;
  name: string;
};

export type PortalStudentProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  studentCode: string;
};

export type PortalCourse = {
  id: string;
  code: string;
  title: string;
  program: string;
  level: string;
  mode: "offline";
  status: "active" | "completed";
  startDate: string;
  endDate: string;
  completedDate?: string;
  assignmentProgress: { completed: number; total: number };
  progressPercent: number;
  teachers: { id: string; name: string; role: string }[];
  classmates: { id: string; name: string; initials: string }[];
  stageIds: string[];
  groupName: string;
  center: string;
};

export type PortalStage = {
  id: string;
  courseId: string;
  order: number;
  name: string;
  skill: string[];
  level: string;
  status: "upcoming" | "active" | "completed";
  studentStatus: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  center: string;
  room: string;
  totalSessions: number;
  progress: {
    session: { completed: number; total: number };
    attendance: { present: number; total: number };
    practice: { completed: number; total: number };
    assignments: { completed: number; inProgress: number; total: number };
    vocabulary: { completed: number; inProgress: number; total: number };
    exercises: { completed: number; inProgress: number; total: number };
    samples: { read: number; reading: number; total: number };
    roadmap: { completed: number; total: number };
  };
};

export type PortalOverview = {
  viewer: Pick<PortalViewer, "fullName" | "email" | "role">;
  student: PortalStudentProfile | null;
  studentOptions: PortalStudentOption[];
  requiresStudentSelection: boolean;
  dashboard: {
    completedCourses: number;
    attendedSessions: number;
    completedPractices: number;
    completedAssignments: number;
  };
  courses: PortalCourse[];
  stagesByCourse: Record<string, PortalStage[]>;
  generatedAt: string;
};

export type PortalLesson = {
  id: string;
  stageId: string;
  sequence: number;
  title: string;
  code: string;
  date?: string;
  vocabularySetIds: string[];
  exerciseIds: string[];
  assignmentIds: string[];
  sampleIds: string[];
};

export type PortalAttendanceSession = {
  id: string;
  stageId: string;
  lessonId?: string;
  sequence: number;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  type: string;
  lessonTitle: string;
  room: string;
  teacher: string;
  mark: "P" | "A" | "";
};

export type PortalScheduleEvent = {
  id: string;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  title: string;
  teacher: string;
  room: string;
  stage: string;
  courseId: string;
};

export type PortalStageDetail = {
  viewer: PortalOverview["viewer"];
  student: PortalStudentProfile | null;
  studentOptions: PortalStudentOption[];
  requiresStudentSelection: boolean;
  course: PortalCourse | null;
  stage: PortalStage | null;
  siblings: PortalStage[];
  lessons: PortalLesson[];
  attendance: PortalAttendanceSession[];
  generatedAt: string;
};

export class PortalDataError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function canReadPortalData(role: Role): boolean {
  return role === "STUDENT" || effectiveRole(role) === "ADMIN";
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "HV";
}

export function isoDate(value: Date | null | undefined, fallback = new Date(0)): string {
  return (value ?? fallback).toISOString().slice(0, 10);
}

export function percent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
}

function stageStatus(completed: number, total: number) {
  if (total > 0 && completed >= total) return "completed" as const;
  if (total > 0) return "active" as const;
  return "upcoming" as const;
}

function emptyWorkProgress() {
  return { completed: 0, inProgress: 0, total: 0 };
}

export function resolvePortalStudentId(
  viewer: PortalViewer,
  requestedStudentId?: string | null,
): string | null {
  if (!canReadPortalData(viewer.role)) {
    throw new PortalDataError(403, "Vai trò hiện tại không được truy cập Portal học viên.");
  }

  if (viewer.role === "STUDENT") {
    if (!viewer.studentId) {
      throw new PortalDataError(404, "Tài khoản chưa được liên kết với hồ sơ học viên.");
    }
    if (requestedStudentId && requestedStudentId !== viewer.studentId) {
      throw new PortalDataError(403, "Bạn không được xem dữ liệu của học viên khác.");
    }
    return viewer.studentId;
  }

  return requestedStudentId?.trim() || null;
}

export async function getPortalOverview(
  viewer: PortalViewer,
  requestedStudentId?: string | null,
): Promise<PortalOverview> {
  const isAdministrator = effectiveRole(viewer.role) === "ADMIN";
  const selectedStudentId = resolvePortalStudentId(viewer, requestedStudentId);
  const studentOptions = isAdministrator
    ? await prisma.student.findMany({
        where: { status: { not: "DROPPED" } },
        orderBy: [{ fullName: "asc" }, { code: "asc" }],
        take: 500,
        select: { id: true, code: true, fullName: true },
      })
    : [];

  const base = {
    viewer: { fullName: viewer.fullName, email: viewer.email, role: viewer.role },
    studentOptions: studentOptions.map((student) => ({
      id: student.id,
      code: student.code,
      name: student.fullName,
    })),
    generatedAt: new Date().toISOString(),
  };

  if (!selectedStudentId) {
    return {
      ...base,
      student: null,
      requiresStudentSelection: true,
      dashboard: {
        completedCourses: 0,
        attendedSessions: 0,
        completedPractices: 0,
        completedAssignments: 0,
      },
      courses: [],
      stagesByCourse: {},
    };
  }

  const student = await prisma.student.findUnique({
    where: { id: selectedStudentId },
    select: {
      id: true,
      code: true,
      fullName: true,
      email: true,
      parentPhone: true,
      user: { select: { email: true, phone: true } },
      enrollments: {
        where: {
          OR: [
            {
              status: { in: ["ACTIVE", "RESERVED"] },
              class: { status: { in: ["ACTIVE", "PAUSED"] } },
            },
            { class: { status: "FINISHED" } },
          ],
        },
        orderBy: { joinedAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          joinedAt: true,
          leftAt: true,
          class: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              status: true,
              startDate: true,
              endDate: true,
              level: { select: { name: true } },
              subLevel: { select: { name: true } },
              ieltsCourse: { select: { name: true } },
              branch: { select: { name: true } },
              room: { select: { name: true } },
              teacher: {
                select: { id: true, user: { select: { fullName: true } } },
              },
              enrollments: {
                where: { status: { in: ["ACTIVE", "RESERVED"] } },
                orderBy: { student: { fullName: "asc" } },
                take: 30,
                select: { student: { select: { id: true, fullName: true } } },
              },
              syllabuses: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  order: true,
                  syllabus: {
                    select: {
                      name: true,
                      levelLabel: true,
                      units: {
                        orderBy: { order: "asc" },
                        select: { id: true, order: true, name: true, topic: true },
                      },
                    },
                  },
                },
              },
              sessions: {
                where: { status: { not: "CANCELLED" }, isOff: false },
                orderBy: [{ date: "asc" }, { startTime: "asc" }],
                select: {
                  id: true,
                  date: true,
                  startTime: true,
                  endTime: true,
                  status: true,
                  hasHomework: true,
                  syllabusLesson: { select: { unitId: true } },
                  room: { select: { name: true } },
                  teacher: {
                    select: { id: true, user: { select: { fullName: true } } },
                  },
                  attendances: {
                    where: { studentId: selectedStudentId },
                    select: {
                      status: true,
                      homeworkRating: true,
                      pronunciationVideoDone: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!student) throw new PortalDataError(404, "Không tìm thấy học viên.");

  const courses: PortalCourse[] = [];
  const stagesByCourse: Record<string, PortalStage[]> = {};
  let attendedSessions = 0;
  let completedPractices = 0;
  let completedAssignments = 0;

  for (const enrollment of student.enrollments) {
    const cls = enrollment.class;
    const joinedDate = new Date(enrollment.joinedAt);
    joinedDate.setUTCHours(0, 0, 0, 0);
    const sessions = cls.sessions.filter((session) => session.date >= joinedDate);
    const completedSessions = sessions.filter((session) => session.status === "COMPLETED");
    const homeworkSessions = sessions.filter((session) => session.hasHomework);
    const homeworkCompleted = homeworkSessions.filter(
      (session) => session.attendances[0]?.homeworkRating != null,
    ).length;
    const courseStatus = cls.status === "FINISHED" ? "completed" as const : "active" as const;
    const lastSession = sessions.at(-1);
    const firstSession = sessions[0];
    const teachers = new Map<string, { id: string; name: string; role: string }>();
    if (cls.teacher) {
      teachers.set(cls.teacher.id, {
        id: cls.teacher.id,
        name: cls.teacher.user.fullName,
        role: "Giáo viên",
      });
    }
    for (const session of sessions) {
      const attendance = session.attendances[0];
      if (session.status === "COMPLETED" && attendance?.status === "PRESENT") attendedSessions += 1;
      if (attendance?.pronunciationVideoDone) completedPractices += 1;
      if (attendance?.homeworkRating) completedAssignments += 1;
      if (session.teacher) {
        teachers.set(session.teacher.id, {
          id: session.teacher.id,
          name: session.teacher.user.fullName,
          role: "Giáo viên",
        });
      }
    }

    const unitRows = cls.syllabuses.flatMap((assignment) =>
      assignment.syllabus.units.map((unit) => ({
        ...unit,
        syllabusName: assignment.syllabus.name,
        levelLabel: assignment.syllabus.levelLabel,
        syllabusOrder: assignment.order,
      })),
    );
    const courseStages = unitRows.map((unit, index): PortalStage => {
      const unitSessions = sessions.filter((session) => session.syllabusLesson?.unitId === unit.id);
      const unitCompleted = unitSessions.filter((session) => session.status === "COMPLETED");
      const present = unitSessions.filter(
        (session) => session.status === "COMPLETED" && session.attendances[0]?.status === "PRESENT",
      ).length;
      const practices = unitSessions.filter(
        (session) => session.attendances[0]?.pronunciationVideoDone,
      ).length;
      const assignments = unitSessions.filter((session) => session.hasHomework);
      const assignmentsDone = assignments.filter(
        (session) => session.attendances[0]?.homeworkRating != null,
      ).length;
      const unitFirst = unitSessions[0] ?? firstSession;
      const unitLast = unitSessions.at(-1) ?? lastSession;

      return {
        id: unit.id,
        courseId: cls.id,
        order: index + 1,
        name: unit.name || `${unit.syllabusName} ${unit.order}`,
        skill: unit.topic ? [unit.topic] : [unit.syllabusName],
        level: unit.levelLabel ?? cls.subLevel?.name ?? cls.level?.name ?? "",
        status: stageStatus(unitCompleted.length, unitSessions.length),
        studentStatus: enrollment.status,
        startDate: isoDate(unitFirst?.date, enrollment.joinedAt),
        endDate: isoDate(unitLast?.date, enrollment.leftAt ?? enrollment.joinedAt),
        startTime: unitFirst?.startTime ?? "",
        endTime: unitLast?.endTime ?? "",
        center: cls.branch?.name ?? "STEPS Education",
        room: unitFirst?.room?.name ?? cls.room?.name ?? "",
        totalSessions: unitSessions.length,
        progress: {
          session: { completed: unitCompleted.length, total: unitSessions.length },
          attendance: { present, total: unitCompleted.length },
          practice: { completed: practices, total: unitCompleted.length },
          assignments: {
            completed: assignmentsDone,
            inProgress: Math.max(0, assignments.length - assignmentsDone),
            total: assignments.length,
          },
          vocabulary: emptyWorkProgress(),
          exercises: emptyWorkProgress(),
          samples: { read: 0, reading: 0, total: 0 },
          roadmap: { completed: 0, total: 0 },
        },
      };
    });

    const startDate = firstSession?.date ?? cls.startDate ?? enrollment.joinedAt;
    const endDate = lastSession?.date ?? cls.endDate ?? enrollment.leftAt ?? startDate;
    courses.push({
      id: cls.id,
      code: cls.code,
      title: cls.name,
      program: cls.type === "IELTS" ? "IELTS" : "Lớp thường",
      level: cls.ieltsCourse?.name ?? cls.subLevel?.name ?? cls.level?.name ?? "",
      mode: "offline",
      status: courseStatus,
      startDate: isoDate(startDate),
      endDate: isoDate(endDate),
      ...(courseStatus === "completed" ? { completedDate: isoDate(endDate) } : {}),
      assignmentProgress: { completed: homeworkCompleted, total: homeworkSessions.length },
      progressPercent: percent(completedSessions.length, sessions.length),
      teachers: [...teachers.values()],
      classmates: cls.enrollments.map(({ student: classmate }) => ({
        id: classmate.id,
        name: classmate.fullName,
        initials: initials(classmate.fullName),
      })),
      stageIds: courseStages.map((stage) => stage.id),
      groupName: cls.code,
      center: cls.branch?.name ?? "STEPS Education",
    });
    stagesByCourse[cls.id] = courseStages;
  }

  courses.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return b.startDate.localeCompare(a.startDate);
  });

  return {
    ...base,
    student: {
      id: student.id,
      name: student.fullName,
      email: student.user?.email ?? student.email ?? "",
      phone: student.user?.phone ?? student.parentPhone ?? "",
      studentCode: student.code,
    },
    requiresStudentSelection: false,
    dashboard: {
      completedCourses: courses.filter((course) => course.status === "completed").length,
      attendedSessions,
      completedPractices,
      completedAssignments,
    },
    courses,
    stagesByCourse,
  };
}

export function attendanceMark(status?: string | null): "P" | "A" | "" {
  if (status === "PRESENT") return "P";
  if (status === "ABSENT") return "A";
  return "";
}

export function parseScheduleRange(fromRaw?: string | null, toRaw?: string | null) {
  const from = parseDateInput(fromRaw) ?? addDaysUtc(startOfWeekUtc(todayUtc()), -7);
  const to = parseDateInput(toRaw) ?? addDaysUtc(from, 41);
  return to < from ? { from: to, to: from } : { from, to };
}

function weekdayLabel(date: Date) {
  return WEEKDAY_SHORT[date.getUTCDay()] ?? "";
}

export async function getPortalStageDetail(
  viewer: PortalViewer,
  courseId: string,
  stageId: string,
  requestedStudentId?: string | null,
): Promise<PortalStageDetail> {
  const overview = await getPortalOverview(viewer, requestedStudentId);
  const frame = {
    viewer: overview.viewer,
    student: overview.student,
    studentOptions: overview.studentOptions,
    requiresStudentSelection: overview.requiresStudentSelection,
    generatedAt: new Date().toISOString(),
  };

  if (overview.requiresStudentSelection || !overview.student) {
    return {
      ...frame,
      course: null,
      stage: null,
      siblings: [],
      lessons: [],
      attendance: [],
    };
  }

  const course = overview.courses.find((item) => item.id === courseId) ?? null;
  const siblings = overview.stagesByCourse[courseId] ?? [];
  const stage = siblings.find((item) => item.id === stageId) ?? null;
  if (!course || !stage) {
    throw new PortalDataError(404, "Không tìm thấy giai đoạn học của học viên này.");
  }

  const [syllabusLessons, sessions] = await Promise.all([
    prisma.syllabusLesson.findMany({
      where: { unitId: stageId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        order: true,
        lessonNumber: true,
        lessonType: true,
      },
    }),
    prisma.lessonSession.findMany({
      where: {
        classId: courseId,
        status: { not: "CANCELLED" },
        isOff: false,
        syllabusLesson: { unitId: stageId },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        sequence: true,
        date: true,
        startTime: true,
        endTime: true,
        isExtra: true,
        syllabusLesson: {
          select: { id: true, name: true, order: true, lessonNumber: true, lessonType: true },
        },
        room: { select: { name: true } },
        teacher: { select: { user: { select: { fullName: true } } } },
        attendances: {
          where: { studentId: overview.student.id },
          select: { status: true },
        },
      },
    }),
  ]);

  const lessonsById = new Map<string, PortalLesson>();
  for (const lesson of syllabusLessons) {
    lessonsById.set(lesson.id, {
      id: lesson.id,
      stageId,
      sequence: lesson.lessonNumber ?? lesson.order,
      title: lesson.name,
      code: `B${lesson.lessonNumber ?? lesson.order}`,
      vocabularySetIds: [],
      exerciseIds: [],
      assignmentIds: [],
      sampleIds: [],
    });
  }

  const attendance: PortalAttendanceSession[] = sessions.map((session) => {
    const lesson = session.syllabusLesson;
    if (lesson && !lessonsById.has(lesson.id)) {
      lessonsById.set(lesson.id, {
        id: lesson.id,
        stageId,
        sequence: lesson.lessonNumber ?? lesson.order,
        title: lesson.name,
        code: `B${lesson.lessonNumber ?? lesson.order}`,
        date: isoDate(session.date),
        vocabularySetIds: [],
        exerciseIds: [],
        assignmentIds: [],
        sampleIds: [],
      });
    } else if (lesson) {
      const existing = lessonsById.get(lesson.id);
      if (existing && !existing.date) existing.date = isoDate(session.date);
    }

    return {
      id: session.id,
      stageId,
      lessonId: lesson?.id,
      sequence: session.sequence,
      date: isoDate(session.date),
      weekday: weekdayLabel(session.date),
      startTime: session.startTime,
      endTime: session.endTime,
      type: session.isExtra ? "Bù/thêm" : lesson?.lessonType || "Buổi học",
      lessonTitle: lesson?.name ?? `Buổi ${session.sequence}`,
      room: session.room?.name ?? course.center,
      teacher: session.teacher?.user.fullName ?? course.teachers[0]?.name ?? "",
      mark: attendanceMark(session.attendances[0]?.status),
    };
  });

  const lessons = [...lessonsById.values()].sort((a, b) => a.sequence - b.sequence);

  return {
    ...frame,
    course,
    stage,
    siblings,
    lessons,
    attendance,
  };
}

export async function getPortalSchedule(
  viewer: PortalViewer,
  requestedStudentId?: string | null,
  fromRaw?: string | null,
  toRaw?: string | null,
) {
  const overview = await getPortalOverview(viewer, requestedStudentId);
  const { from, to } = parseScheduleRange(fromRaw, toRaw);
  const frame = {
    viewer: overview.viewer,
    student: overview.student,
    studentOptions: overview.studentOptions,
    requiresStudentSelection: overview.requiresStudentSelection,
    from: isoDate(from),
    to: isoDate(to),
    generatedAt: new Date().toISOString(),
  };

  if (overview.requiresStudentSelection || !overview.student) {
    return { ...frame, events: [] as PortalScheduleEvent[] };
  }

  const classIds = overview.courses.map((course) => course.id);
  if (classIds.length === 0) {
    return { ...frame, events: [] as PortalScheduleEvent[] };
  }

  const sessions = await prisma.lessonSession.findMany({
    where: {
      classId: { in: classIds },
      date: { gte: from, lte: to },
      status: { not: "CANCELLED" },
      isOff: false,
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      classId: true,
      date: true,
      startTime: true,
      endTime: true,
      syllabusLesson: {
        select: { name: true, unit: { select: { name: true } } },
      },
      room: { select: { name: true } },
      teacher: { select: { user: { select: { fullName: true } } } },
      class: { select: { name: true, room: { select: { name: true } } } },
    },
  });

  const courseById = new Map(overview.courses.map((course) => [course.id, course]));
  const events: PortalScheduleEvent[] = sessions.map((session) => {
    const course = courseById.get(session.classId);
    return {
      id: session.id,
      date: isoDate(session.date),
      weekday: weekdayLabel(session.date),
      startTime: session.startTime,
      endTime: session.endTime,
      title: session.syllabusLesson?.name ?? session.class.name,
      teacher: session.teacher?.user.fullName ?? course?.teachers[0]?.name ?? "",
      room: session.room?.name ?? session.class.room?.name ?? course?.center ?? "",
      stage: session.syllabusLesson?.unit?.name ?? course?.title ?? "",
      courseId: session.classId,
    };
  });

  return { ...frame, events };
}
