"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";

export async function getCurriculumOutline(syllabusId: string) {
  await requireAdmin();
  return prisma.curriculumSection.findMany({
    where: { syllabusId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      title: true,
      sortOrder: true,
      unit: { select: { id: true, unitNumber: true, topic: true, overview: true, learningObjectives: true } },
      courseDays: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          courseDayNumber: true,
          unitDayNumber: true,
          title: true,
          lessons: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              name: true,
              order: true,
              lessonNumber: true,
              _count: { select: { sessions: true } },
            },
          },
        },
      },
    },
  });
}

export async function getCurriculumLesson(lessonId: string) {
  await requireAdmin();
  return prisma.syllabusLesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      name: true,
      lessonType: true,
      pupilBookPage: true,
      activityBookPage: true,
      hasListening: true,
      hasSpeaking: true,
      hasReading: true,
      hasWriting: true,
      tasks: true,
      languageTargets: true,
      lessonOutcomes: true,
      lessonPlan: true,
      homework: true,
      materials: true,
    },
  });
}

export async function getCurriculumResources(syllabusId: string) {
  await requireAdmin();
  const [resources, sections] = await Promise.all([
    prisma.lessonResource.findMany({
      where: { syllabusId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        section: { select: { title: true } },
        courseDay: { select: { courseDayNumber: true } },
        unit: { select: { topic: true } },
        lesson: { select: { name: true } },
      },
    }),
    prisma.curriculumSection.findMany({
      where: { syllabusId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        unit: { select: { id: true, topic: true } },
        courseDays: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            courseDayNumber: true,
            title: true,
            lessons: { orderBy: [{ order: "asc" }], select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  return {
    resources,
    sections: sections.map((section) => ({ id: section.id, label: section.title })),
    courseDays: sections.flatMap((section) =>
      section.courseDays.map((day) => ({
        id: day.id,
        label: `Day ${day.courseDayNumber} - ${day.title || section.title}`,
      })),
    ),
    units: sections.flatMap((section) =>
      section.unit ? [{ id: section.unit.id, label: section.unit.topic || section.title }] : [],
    ),
    lessons: sections.flatMap((section) =>
      section.courseDays.flatMap((day) =>
        day.lessons.map((lesson) => ({ id: lesson.id, label: `Day ${day.courseDayNumber} - ${lesson.name}` })),
      ),
    ),
  };
}
