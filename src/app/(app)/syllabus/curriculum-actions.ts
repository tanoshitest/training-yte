"use server";

import { revalidatePath } from "next/cache";

import type { CurriculumSectionType, LessonResourceType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  fail,
  optionalInt,
  optionalStr,
  requiredId,
  requiredStr,
  runAction,
  type ActionState,
} from "@/lib/form-utils";
import { cardsFromForm, serializeVocab } from "./vocab";

const SECTION_TYPES: CurriculumSectionType[] = [
  "UNIT",
  "REVIEW",
  "PROJECT",
  "MIDTERM_TEST",
  "FINAL_TEST",
  "OTHER",
];
const RESOURCE_TYPES: LessonResourceType[] = [
  "LESSON_PLAN",
  "VIDEO",
  "AUDIO",
  "WORKSHEET",
  "PDF",
  "SLIDE",
  "GAME",
  "QUIZ",
  "HOMEWORK",
  "TEACHER_RESOURCE",
  "STUDENT_RESOURCE",
  "EXTERNAL_LINK",
  "OTHER",
];

function refresh(syllabusId: string) {
  revalidatePath(`/syllabus/${syllabusId}`, "layout");
  revalidatePath("/syllabus");
  revalidatePath("/lop-hoc", "layout");
}

function enumValue<T extends string>(fd: FormData, name: string, values: T[], label: string): T {
  const value = String(fd.get(name) ?? "");
  if (!values.includes(value as T)) fail(`${label} không hợp lệ.`);
  return value as T;
}

function lines(fd: FormData, name: string) {
  const value = String(fd.get(name) ?? "").trim();
  return value ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

function repeated(fd: FormData, name: string) {
  return fd.getAll(name).map((value) => String(value).trim()).filter(Boolean);
}

function readLessonVocab(fd: FormData) {
  const json = serializeVocab(cardsFromForm(fd));
  if (json && json.length > 2_000_000) fail("Từ vựng quá dài — bớt ảnh hoặc chọn ảnh nhẹ hơn.");
  return json;
}

function readLessonMaterials(fd: FormData) {
  const titles = fd.getAll("materialTitle").map((value) => String(value).trim());
  const urls = fd.getAll("materialUrl").map((value) => String(value).trim());
  const items: { title: string; url: string }[] = [];
  for (let i = 0; i < Math.max(titles.length, urls.length); i += 1) {
    const title = titles[i] ?? "";
    const url = urls[i] ?? "";
    if (!title && !url) continue;
    if (!url) fail(`Học liệu "${title}" chưa có link.`);
    if (!/^https?:\/\//i.test(url)) fail("Link học liệu phải bắt đầu bằng http:// hoặc https://.");
    items.push({ title: title || url, url: url.slice(0, 1000) });
  }
  return items;
}

async function assertSyllabus(id: string) {
  if (!(await prisma.syllabus.findUnique({ where: { id }, select: { id: true } }))) {
    fail("Không tìm thấy syllabus.");
  }
}

async function normalizeCurriculum(syllabusId: string) {
  const sections = await prisma.curriculumSection.findMany({
    where: { syllabusId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      courseDays: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, sectionId: true },
      },
    },
  });
  const days = sections.flatMap((section) => section.courseDays);
  await prisma.$transaction(async (tx) => {
    for (const [index, day] of days.entries()) {
      await tx.courseDay.update({
        where: { id: day.id },
        data: { courseDayNumber: -10000 - index, sortOrder: -10000 - index },
      });
    }
    for (const [index, day] of days.entries()) {
      await tx.courseDay.update({
        where: { id: day.id },
        data: { courseDayNumber: index + 1, sortOrder: index + 1 },
      });
    }
    const sections = await tx.curriculumSection.findMany({
      where: { syllabusId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    for (const section of sections) {
      const sectionDays = days.filter((day) => day.sectionId === section.id);
      await tx.curriculumSection.update({
        where: { id: section.id },
        data: {
          courseDayStart: sectionDays.length ? days.indexOf(sectionDays[0]) + 1 : null,
          courseDayEnd: sectionDays.length ? days.indexOf(sectionDays.at(-1)!) + 1 : null,
        },
      });
    }
    await tx.syllabus.update({ where: { id: syllabusId }, data: { totalCourseDays: days.length } });
  });
}

async function assertResourceScope(syllabusId: string, values: {
  sectionId?: string | null;
  unitId?: string | null;
  courseDayId?: string | null;
  lessonId?: string | null;
}) {
  const checks = await Promise.all([
    values.sectionId
      ? prisma.curriculumSection.count({ where: { id: values.sectionId, syllabusId } })
      : 1,
    values.unitId
      ? prisma.syllabusUnit.count({ where: { id: values.unitId, syllabusId } })
      : 1,
    values.courseDayId
      ? prisma.courseDay.count({ where: { id: values.courseDayId, syllabusId } })
      : 1,
    values.lessonId
      ? prisma.syllabusLesson.count({
          where: {
            id: values.lessonId,
            OR: [{ courseDay: { syllabusId } }, { unit: { syllabusId } }],
          },
        })
      : 1,
  ]);
  if (checks.some((count) => count === 0)) fail("Hoc lieu khong thuoc syllabus nay.");
}

export async function createSection(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  return runAction(async () => {
    await assertSyllabus(syllabusId);
    const type = enumValue(fd, "type", SECTION_TYPES, "Loại section");
    const title = requiredStr(fd, "title", "Tên section", 180);
    const last = await prisma.curriculumSection.findFirst({
      where: { syllabusId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.$transaction(async (tx) => {
      const section = await tx.curriculumSection.create({
        data: { syllabusId, type, title, sortOrder: (last?.sortOrder ?? 0) + 1 },
      });
      if (type === "UNIT") {
        const count = await tx.syllabusUnit.count({ where: { syllabusId } });
        await tx.syllabusUnit.create({
          data: {
            syllabusId,
            sectionId: section.id,
            unitNumber: count + 1,
            name: title,
            order: count + 1,
          },
        });
      }
    });
    return "Đã thêm section.";
  }).finally(() => refresh(syllabusId));
}

export async function updateSection(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "section");
  return runAction(async () => {
    const current = await prisma.curriculumSection.findFirst({ where: { id, syllabusId }, include: { unit: true } });
    if (!current) fail("Không tìm thấy section.");
    const type = enumValue(fd, "type", SECTION_TYPES, "Loại section");
    const title = requiredStr(fd, "title", "Tên section", 180);
    await prisma.$transaction(async (tx) => {
      await tx.curriculumSection.update({ where: { id }, data: { type, title } });
      if (type === "UNIT") {
        if (current.unit) {
          await tx.syllabusUnit.update({
            where: { id: current.unit.id },
            data: {
              name: title,
              topic: optionalStr(fd, "topic", 180),
              overview: optionalStr(fd, "overview", 10_000),
            },
          });
        } else {
          const count = await tx.syllabusUnit.count({ where: { syllabusId } });
          await tx.syllabusUnit.create({
            data: { syllabusId, sectionId: id, unitNumber: count + 1, name: title, order: count + 1 },
          });
        }
      }
    });
    return "Đã lưu section.";
  }).finally(() => refresh(syllabusId));
}

export async function moveSection(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "section");
  const direction = String(fd.get("direction") ?? "");
  return runAction(async () => {
    const current = await prisma.curriculumSection.findFirst({ where: { id, syllabusId } });
    if (!current) fail("Không tìm thấy section.");
    const neighbour = await prisma.curriculumSection.findFirst({
      where: direction === "up"
        ? { syllabusId, sortOrder: { lt: current.sortOrder } }
        : { syllabusId, sortOrder: { gt: current.sortOrder } },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return "Section đã ở đầu/cuối.";
    await prisma.$transaction([
      prisma.curriculumSection.update({ where: { id }, data: { sortOrder: -1 } }),
      prisma.curriculumSection.update({ where: { id: neighbour.id }, data: { sortOrder: current.sortOrder } }),
      prisma.curriculumSection.update({ where: { id }, data: { sortOrder: neighbour.sortOrder } }),
    ]);
    return "Đã đổi thứ tự section.";
  }).finally(async () => {
    await normalizeCurriculum(syllabusId);
    refresh(syllabusId);
  });
}

export async function deleteSection(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "section");
  return runAction(async () => {
    const section = await prisma.curriculumSection.findFirst({
      where: { id, syllabusId },
      include: { courseDays: { select: { lessons: { select: { _count: { select: { sessions: true } } } } } } },
    });
    if (!section) fail("Không tìm thấy section.");
    const used = section.courseDays.some((day) => day.lessons.some((lesson) => lesson._count.sessions > 0));
    if (used) fail("Section đã được dùng trong lịch dạy nên không thể xóa.");
    await prisma.curriculumSection.delete({ where: { id } });
    return "Đã xóa section.";
  }).finally(async () => {
    await normalizeCurriculum(syllabusId);
    refresh(syllabusId);
  });
}

export async function createCourseDay(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const sectionId = requiredId(fd, "sectionId", "section");
  return runAction(async () => {
    const section = await prisma.curriculumSection.findFirst({
      where: { id: sectionId, syllabusId }, select: { id: true, unit: { select: { id: true } } },
    });
    if (!section) fail("Section không thuộc syllabus này.");
    const count = await prisma.courseDay.count({ where: { syllabusId } });
    const unitDayNumber = optionalInt(fd, "unitDayNumber", "Unit Day", { min: 1, max: 999 });
    const title = optionalStr(fd, "title", 180);
    await prisma.courseDay.create({
      data: {
        syllabusId,
        sectionId,
        unitId: section.unit?.id,
        courseDayNumber: count + 1,
        unitDayNumber,
        title,
        sortOrder: count + 1,
        lessons: {
          create: {
            unitId: section.unit?.id,
            lessonNumber: 1,
            lessonType: "OTHER",
            name: title || "Lesson 1",
            order: 1,
          },
        },
      },
    });
    return "Đã thêm Course Day.";
  }).finally(async () => {
    await normalizeCurriculum(syllabusId);
    refresh(syllabusId);
  });
}

export async function updateCourseDay(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "Course Day");
  return runAction(async () => {
    const day = await prisma.courseDay.findFirst({ where: { id, syllabusId } });
    if (!day) fail("Không tìm thấy Course Day.");
    await prisma.courseDay.update({
      where: { id },
      data: {
        unitDayNumber: optionalInt(fd, "unitDayNumber", "Unit Day", { min: 1, max: 999 }),
        title: optionalStr(fd, "title", 180),
      },
    });
    return "Đã lưu Course Day.";
  }).finally(() => refresh(syllabusId));
}

export async function moveCourseDay(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "Course Day");
  const direction = String(fd.get("direction") ?? "");
  return runAction(async () => {
    const current = await prisma.courseDay.findFirst({ where: { id, syllabusId } });
    if (!current) fail("Không tìm thấy Course Day.");
    const neighbour = await prisma.courseDay.findFirst({
      where: direction === "up"
        ? { syllabusId, sortOrder: { lt: current.sortOrder } }
        : { syllabusId, sortOrder: { gt: current.sortOrder } },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return "Course Day đã ở đầu/cuối.";
    await prisma.$transaction([
      prisma.courseDay.update({ where: { id }, data: { sortOrder: -1, courseDayNumber: -1 } }),
      prisma.courseDay.update({ where: { id: neighbour.id }, data: { sortOrder: current.sortOrder, courseDayNumber: current.courseDayNumber } }),
      prisma.courseDay.update({ where: { id }, data: { sortOrder: neighbour.sortOrder, courseDayNumber: neighbour.courseDayNumber } }),
    ]);
    return "Đã đổi thứ tự Course Day.";
  }).finally(async () => {
    await normalizeCurriculum(syllabusId);
    refresh(syllabusId);
  });
}

export async function deleteCourseDay(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "Course Day");
  return runAction(async () => {
    const day = await prisma.courseDay.findFirst({
      where: { id, syllabusId },
      include: { lessons: { select: { _count: { select: { sessions: true } } } } },
    });
    if (!day) fail("Không tìm thấy Course Day.");
    if (day.lessons.some((lesson) => lesson._count.sessions > 0)) {
      fail("Course Day đã được dùng trong lịch dạy nên không thể xóa.");
    }
    await prisma.courseDay.delete({ where: { id } });
    return "Đã xóa Course Day.";
  }).finally(async () => {
    await normalizeCurriculum(syllabusId);
    refresh(syllabusId);
  });
}

export async function createCurriculumLesson(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const courseDayId = requiredId(fd, "courseDayId", "Course Day");
  return runAction(async () => {
    const day = await prisma.courseDay.findFirst({ where: { id: courseDayId, syllabusId } });
    if (!day) fail("Course Day không thuộc syllabus này.");
    const count = await prisma.syllabusLesson.count({ where: { courseDayId } });
    await prisma.syllabusLesson.create({
      data: {
        courseDayId,
        unitId: day.unitId,
        lessonNumber: count + 1,
        lessonType: optionalStr(fd, "lessonType", 80) ?? "OTHER",
        name: optionalStr(fd, "name", 180) ?? `Lesson ${count + 1}`,
        order: count + 1,
      },
    });
    return "Đã thêm lesson.";
  }).finally(() => refresh(syllabusId));
}

export async function updateCurriculumLesson(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "lesson");
  return runAction(async () => {
    const lesson = await prisma.syllabusLesson.findFirst({ where: { id, courseDay: { syllabusId } } });
    if (!lesson) fail("Lesson không thuộc syllabus này.");
    const name = requiredStr(fd, "dayTitle", "Tiêu đề ngày", 180);
    const unitDayNumber = optionalInt(fd, "unitDayNumber", "Day", { min: 1, max: 999 });
    await prisma.syllabusLesson.update({
      where: { id },
      data: {
        name,
        lessonType: requiredStr(fd, "lessonType", "Loại lesson", 80),
        pupilBookPage: optionalStr(fd, "pupilBookPage", 80),
        activityBookPage: optionalStr(fd, "activityBookPage", 80),
        hasListening: fd.get("hasListening") === "on",
        hasSpeaking: fd.get("hasSpeaking") === "on",
        hasReading: fd.get("hasReading") === "on",
        hasWriting: fd.get("hasWriting") === "on",
        tasks: lines(fd, "tasks"),
        ...(fd.get("vocabReady") === "1" ? { vocabulary: readLessonVocab(fd) } : {}),
        languageTargets: repeated(fd, "languageTargets"),
        lessonOutcomes: lines(fd, "lessonOutcomes"),
        lessonPlan: repeated(fd, "lessonPlanStep").join("\n") || null,
        grammar: repeated(fd, "languageTargets").join("\n") || null,
        homework: optionalStr(fd, "homework", 20_000),
        materials: readLessonMaterials(fd),
      },
    });
    if (lesson.courseDayId) {
      await prisma.courseDay.update({
        where: { id: lesson.courseDayId },
        data: {
          title: name,
          unitDayNumber: unitDayNumber ?? undefined,
        },
      });
    }
    return "Đã lưu.";
  }).finally(() => refresh(syllabusId));
}

export async function createResource(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  return runAction(async () => {
    await assertSyllabus(syllabusId);
    const url = requiredStr(fd, "url", "URL", 2000);
    if (!/^https?:\/\//i.test(url)) fail("URL phải bắt đầu bằng http:// hoặc https://.");
    const target = optionalStr(fd, "target", 200);
    const [targetType, targetId] = target?.includes(":") ? target.split(":", 2) : [null, null];
    const lessonId = targetType === "lesson" ? targetId : optionalStr(fd, "lessonId", 100);
    const courseDayId = targetType === "courseDay" ? targetId : optionalStr(fd, "courseDayId", 100);
    const sectionId = targetType === "section" ? targetId : optionalStr(fd, "sectionId", 100);
    const unitId = targetType === "unit" ? targetId : optionalStr(fd, "unitId", 100);
    await assertResourceScope(syllabusId, { lessonId, courseDayId, sectionId, unitId });
    const count = await prisma.lessonResource.count({ where: { syllabusId } });
    await prisma.lessonResource.create({
      data: {
        syllabusId,
        lessonId,
        courseDayId,
        sectionId,
        unitId,
        resourceType: enumValue(fd, "resourceType", RESOURCE_TYPES, "Loại học liệu"),
        title: requiredStr(fd, "title", "Tên học liệu", 180),
        url,
        description: optionalStr(fd, "description", 2000),
        openInNewTab: fd.get("openInNewTab") === "on",
        isActive: fd.get("isActive") === "on",
        sortOrder: count + 1,
      },
    });
    return "Đã thêm học liệu.";
  }).finally(() => refresh(syllabusId));
}

export async function updateResource(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "học liệu");
  return runAction(async () => {
    const current = await prisma.lessonResource.findFirst({ where: { id, syllabusId } });
    if (!current) fail("Không tìm thấy học liệu.");
    const url = requiredStr(fd, "url", "URL", 2000);
    if (!/^https?:\/\//i.test(url)) fail("URL phải bắt đầu bằng http:// hoặc https://.");
    await prisma.lessonResource.update({
      where: { id },
      data: {
        resourceType: enumValue(fd, "resourceType", RESOURCE_TYPES, "Loại học liệu"),
        title: requiredStr(fd, "title", "Tên học liệu", 180),
        url,
        description: optionalStr(fd, "description", 2000),
        openInNewTab: fd.get("openInNewTab") === "on",
        isActive: fd.get("isActive") === "on",
      },
    });
    return "Đã lưu học liệu.";
  }).finally(() => refresh(syllabusId));
}

export async function deleteResource(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "học liệu");
  return runAction(async () => {
    const result = await prisma.lessonResource.deleteMany({ where: { id, syllabusId } });
    if (!result.count) fail("Không tìm thấy học liệu.");
    return "Đã xóa học liệu.";
  }).finally(() => refresh(syllabusId));
}

export async function moveCurriculumLesson(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "lesson");
  const direction = String(fd.get("direction") ?? "");
  return runAction(async () => {
    const lesson = await prisma.syllabusLesson.findFirst({
      where: { id, courseDay: { syllabusId } },
    });
    if (!lesson?.courseDayId) fail("Khong tim thay lesson.");
    const neighbour = await prisma.syllabusLesson.findFirst({
      where: direction === "up"
        ? { courseDayId: lesson.courseDayId, order: { lt: lesson.order } }
        : { courseDayId: lesson.courseDayId, order: { gt: lesson.order } },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return "Lesson da o dau/cuoi.";
    await prisma.$transaction([
      prisma.syllabusLesson.update({ where: { id }, data: { order: -1000 } }),
      prisma.syllabusLesson.update({ where: { id: neighbour.id }, data: { order: lesson.order } }),
      prisma.syllabusLesson.update({ where: { id }, data: { order: neighbour.order } }),
    ]);
    return "Da doi thu tu lesson.";
  }).finally(() => refresh(syllabusId));
}

export async function moveResource(_state: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "hoc lieu");
  const direction = String(fd.get("direction") ?? "");
  return runAction(async () => {
    const resource = await prisma.lessonResource.findFirst({ where: { id, syllabusId } });
    if (!resource) fail("Khong tim thay hoc lieu.");
    const neighbour = await prisma.lessonResource.findFirst({
      where: direction === "up"
        ? { syllabusId, sortOrder: { lt: resource.sortOrder } }
        : { syllabusId, sortOrder: { gt: resource.sortOrder } },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return "Hoc lieu da o dau/cuoi.";
    await prisma.$transaction([
      prisma.lessonResource.update({ where: { id }, data: { sortOrder: -1000 } }),
      prisma.lessonResource.update({ where: { id: neighbour.id }, data: { sortOrder: resource.sortOrder } }),
      prisma.lessonResource.update({ where: { id }, data: { sortOrder: neighbour.sortOrder } }),
    ]);
    return "Da doi thu tu hoc lieu.";
  }).finally(() => refresh(syllabusId));
}
