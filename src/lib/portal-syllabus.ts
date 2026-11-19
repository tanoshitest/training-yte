import { parseMaterials } from "@/app/(app)/syllabus/materials";
import { kindLabelFor, skillLabel, type Exercise, type SkillId } from "@/app/(app)/syllabus/exercises/types";
import { parseVocab, stringList } from "@/app/(app)/syllabus/vocab";
import type { Prisma } from "@/generated/prisma/client";
import { effectiveRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

import {
  PortalDataError,
  resolvePortalStudentId,
  type PortalStudentOption,
  type PortalViewer,
} from "./portal-data";

export type PortalSyllabusCard = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  levelLabel: string | null;
  classIds: string[];
  classNames: string[];
  unitCount: number;
  dayCount: number;
};

export type PortalSyllabusDayStub = {
  id: string;
  number: number;
  title: string;
};

export type PortalSyllabusSection = {
  id: string;
  type: string;
  title: string;
  unitNumber: number | null;
  topic: string | null;
  overview: string | null;
  objectives: string[];
  days: PortalSyllabusDayStub[];
};

export type PortalSyllabusDetail = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  levelLabel: string | null;
  classNames: string[];
  sections: PortalSyllabusSection[];
};

export type PortalSyllabusDay = {
  id: string;
  heading: string;
  name: string;
  pupilBookPage: string | null;
  activityBookPage: string | null;
  hasListening: boolean;
  hasSpeaking: boolean;
  hasReading: boolean;
  hasWriting: boolean;
  tasks: string[];
  vocabulary: ReturnType<typeof parseVocab>;
  grammar: string[];
  outcomes: string[];
  lessonPlan: string[];
  homework: string | null;
  materials: ReturnType<typeof parseMaterials>;
  exercises: { id: string; skill: string; kind: string; title: string }[];
};

export type PortalSyllabusCatalog = {
  studentId: string | null;
  requiresStudentSelection: boolean;
  studentOptions: PortalStudentOption[];
  items: PortalSyllabusCard[];
};

function studentEnrollmentWhere(studentId: string): Prisma.EnrollmentWhereInput {
  return {
    studentId,
    OR: [
      {
        status: { in: ["ACTIVE", "RESERVED"] },
        class: { status: { in: ["ACTIVE", "PAUSED"] } },
      },
      { class: { status: "FINISHED" } },
    ],
  };
}

async function portalStudentOptions(viewer: PortalViewer): Promise<PortalStudentOption[]> {
  if (effectiveRole(viewer.role) !== "ADMIN") return [];
  const rows = await prisma.student.findMany({
    where: { status: { not: "DROPPED" } },
    orderBy: [{ fullName: "asc" }, { code: "asc" }],
    take: 500,
    select: { id: true, code: true, fullName: true },
  });
  return rows.map((student) => ({ id: student.id, code: student.code, name: student.fullName }));
}

async function requireAssignedSyllabus(studentId: string, syllabusId: string) {
  const rows = await prisma.enrollment.findMany({
    where: {
      studentId,
      OR: [
        {
          status: { in: ["ACTIVE", "RESERVED"] },
          class: {
            status: { in: ["ACTIVE", "PAUSED"] },
            syllabuses: { some: { syllabusId } },
          },
        },
        {
          class: {
            status: "FINISHED",
            syllabuses: { some: { syllabusId } },
          },
        },
      ],
    } satisfies Prisma.EnrollmentWhereInput,
    select: { class: { select: { name: true, code: true } } },
    orderBy: { joinedAt: "desc" },
  });
  if (rows.length === 0) {
    throw new PortalDataError(403, "Syllabus này chưa được gán cho lớp của bạn.");
  }
  return rows.map((row) => row.class.name || row.class.code);
}

export async function getPortalSyllabuses(
  viewer: PortalViewer,
  requestedStudentId?: string | null,
): Promise<PortalSyllabusCatalog> {
  const studentOptions = await portalStudentOptions(viewer);
  const studentId = resolvePortalStudentId(viewer, requestedStudentId);
  if (!studentId) {
    return { studentId: null, requiresStudentSelection: true, studentOptions, items: [] };
  }

  const enrollments = await prisma.enrollment.findMany({
    where: studentEnrollmentWhere(studentId),
    orderBy: { joinedAt: "desc" },
    select: {
      class: {
        select: {
          id: true,
          name: true,
          code: true,
          syllabuses: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            select: {
              syllabus: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  description: true,
                  levelLabel: true,
                  _count: { select: { sections: true, courseDays: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const byId = new Map<string, PortalSyllabusCard>();
  for (const enrollment of enrollments) {
    const className = enrollment.class.name || enrollment.class.code;
    for (const row of enrollment.class.syllabuses) {
      const current = byId.get(row.syllabus.id);
      if (current) {
        if (!current.classIds.includes(enrollment.class.id)) current.classIds.push(enrollment.class.id);
        if (!current.classNames.includes(className)) current.classNames.push(className);
        continue;
      }
      byId.set(row.syllabus.id, {
        id: row.syllabus.id,
        code: row.syllabus.code,
        name: row.syllabus.name,
        description: row.syllabus.description,
        levelLabel: row.syllabus.levelLabel,
        classIds: [enrollment.class.id],
        classNames: [className],
        unitCount: row.syllabus._count.sections,
        dayCount: row.syllabus._count.courseDays,
      });
    }
  }

  return { studentId, requiresStudentSelection: false, studentOptions, items: [...byId.values()] };
}

export async function getPortalSyllabusDetail(
  viewer: PortalViewer,
  syllabusId: string,
  requestedStudentId?: string | null,
): Promise<PortalSyllabusDetail> {
  const studentId = resolvePortalStudentId(viewer, requestedStudentId);
  if (!studentId) throw new PortalDataError(400, "Chọn học viên để xem syllabus.");
  const classNames = await requireAssignedSyllabus(studentId, syllabusId);

  const syllabus = await prisma.syllabus.findUnique({
    where: { id: syllabusId },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      levelLabel: true,
      sections: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          title: true,
          unit: { select: { unitNumber: true, topic: true, overview: true, learningObjectives: true } },
          courseDays: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              unitDayNumber: true,
              title: true,
              lessons: { orderBy: { order: "asc" }, select: { name: true }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!syllabus) throw new PortalDataError(404, "Không tìm thấy syllabus.");

  return {
    id: syllabus.id,
    code: syllabus.code,
    name: syllabus.name,
    description: syllabus.description,
    levelLabel: syllabus.levelLabel,
    classNames,
    sections: syllabus.sections.map((section) => ({
      id: section.id,
      type: section.type,
      title: section.title,
      unitNumber: section.unit?.unitNumber ?? null,
      topic: section.unit?.topic ?? null,
      overview: section.unit?.overview ?? null,
      objectives: stringList(section.unit?.learningObjectives),
      days: section.courseDays.map((day, index) => ({
        id: day.id,
        number: day.unitDayNumber ?? index + 1,
        title: day.title || day.lessons[0]?.name || `Day ${day.unitDayNumber ?? index + 1}`,
      })),
    })),
  };
}

export async function getPortalSyllabusDay(
  viewer: PortalViewer,
  syllabusId: string,
  dayId: string,
  requestedStudentId?: string | null,
): Promise<PortalSyllabusDay> {
  const studentId = resolvePortalStudentId(viewer, requestedStudentId);
  if (!studentId) throw new PortalDataError(400, "Chọn học viên để xem syllabus.");
  await requireAssignedSyllabus(studentId, syllabusId);

  const day = await prisma.courseDay.findFirst({
    where: { id: dayId, syllabusId },
    select: {
      id: true,
      unitDayNumber: true,
      title: true,
      sortOrder: true,
      lessons: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          name: true,
          pupilBookPage: true,
          activityBookPage: true,
          hasListening: true,
          hasSpeaking: true,
          hasReading: true,
          hasWriting: true,
          tasks: true,
          vocabulary: true,
          languageTargets: true,
          grammar: true,
          lessonOutcomes: true,
          lessonPlan: true,
          homework: true,
          materials: true,
          exercises: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true, skill: true, kind: true, title: true },
          },
        },
      },
    },
  });
  if (!day) throw new PortalDataError(404, "Không tìm thấy buổi học.");

  const lesson = day.lessons[0];
  const dayNumber = day.unitDayNumber ?? day.sortOrder;
  const title = day.title || lesson?.name || "";
  const heading = title ? `Day ${dayNumber} : ${title}` : `Day ${dayNumber}`;
  const tasks = Array.isArray(lesson?.tasks)
    ? lesson.tasks.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  const outcomes = Array.isArray(lesson?.lessonOutcomes)
    ? lesson.lessonOutcomes.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  const grammar = lesson
    ? stringList(lesson.languageTargets).length
      ? stringList(lesson.languageTargets)
      : stringList(lesson.grammar)
    : [];

  return {
    id: day.id,
    heading,
    name: title || heading,
    pupilBookPage: lesson?.pupilBookPage ?? null,
    activityBookPage: lesson?.activityBookPage ?? null,
    hasListening: lesson?.hasListening ?? false,
    hasSpeaking: lesson?.hasSpeaking ?? false,
    hasReading: lesson?.hasReading ?? false,
    hasWriting: lesson?.hasWriting ?? false,
    tasks,
    vocabulary: parseVocab(lesson?.vocabulary),
    grammar,
    outcomes,
    lessonPlan: stringList(lesson?.lessonPlan),
    homework: lesson?.homework ?? null,
    materials: parseMaterials(lesson?.materials),
    exercises: (lesson?.exercises ?? []).map((item) => ({
      id: item.id,
      skill: skillLabel(item.skill as SkillId),
      kind: kindLabelFor(item.skill as SkillId, item.kind),
      title: item.title,
    })),
  };
}

export async function getPortalLessonExercise(
  viewer: PortalViewer,
  syllabusId: string,
  exerciseId: string,
  requestedStudentId?: string | null,
): Promise<Exercise> {
  const studentId = resolvePortalStudentId(viewer, requestedStudentId);
  if (!studentId) throw new PortalDataError(400, "Chọn học viên để xem syllabus.");
  await requireAssignedSyllabus(studentId, syllabusId);

  const row = await prisma.lessonExercise.findFirst({
    where: { id: exerciseId, lesson: { courseDay: { syllabusId } } },
    select: { id: true, skill: true, kind: true, title: true, payload: true },
  });
  if (!row) throw new PortalDataError(404, "Không tìm thấy bài tập.");
  const payload = row.payload && typeof row.payload === "object" ? (row.payload as Exercise) : ({} as Exercise);
  return { ...payload, id: row.id, skill: row.skill, kind: row.kind, title: row.title } as Exercise;
}
