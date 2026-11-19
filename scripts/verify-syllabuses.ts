import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type BackupLesson = { id: string; materials: unknown };
type BackupFile = {
  totals: { materialLinks: number; linkedSessions: number };
  syllabuses: Array<{ units: Array<{ lessons: BackupLesson[] }> }>;
  linkedSessions: Array<{ id: string; syllabusLessonId: string | null }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Verification failed: ${message}`);
}

function materialUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("url" in item)) return [];
    const url = (item as { url?: unknown }).url;
    return typeof url === "string" && url.trim() ? [url.trim()] : [];
  });
}

async function latestBackup() {
  const backupDirectory = path.join(process.cwd(), "backups");
  const files = (await readdir(backupDirectory))
    .filter((file) => file.startsWith("syllabus-pre-refactor-") && file.endsWith(".json"))
    .sort();
  assert(files.length > 0, "no pre-refactor syllabus backup was found");
  const file = path.join(backupDirectory, files.at(-1)!);
  return { file, data: JSON.parse(await readFile(file, "utf8")) as BackupFile };
}

const expectedSyllabus7Sections = [
  ["UNIT", 1, 4],
  ["UNIT", 5, 8],
  ["PROJECT", 9, 9],
  ["UNIT", 10, 13],
  ["REVIEW", 14, 15],
  ["UNIT", 16, 19],
  ["PROJECT", 20, 20],
  ["REVIEW", 21, 22],
  ["MIDTERM_TEST", 23, 24],
  ["UNIT", 25, 28],
  ["UNIT", 29, 32],
  ["PROJECT", 33, 33],
  ["REVIEW", 34, 35],
  ["UNIT", 36, 39],
  ["UNIT", 40, 43],
  ["PROJECT", 44, 44],
  ["UNIT", 45, 48],
  ["REVIEW", 49, 50],
  ["FINAL_TEST", 51, 52],
] as const;

const expectedCourseDays: Record<string, number> = {
  "SYLLABUS-1": 54,
  "SYLLABUS-2": 54,
  "SYLLABUS-3": 54,
  "SYLLABUS-4": 36,
  "SYLLABUS-5": 63,
  "SYLLABUS-6": 73,
  "SYLLABUS-7": 52,
};

async function main() {
  const backup = await latestBackup();
  const legacyLessons = backup.data.syllabuses.flatMap((syllabus) =>
    syllabus.units.flatMap((unit) => unit.lessons),
  );
  const legacyUrls = legacyLessons.flatMap((lesson) =>
    materialUrls(lesson.materials).map((url) => `${lesson.id}\u0000${url}`),
  );

  const [syllabus7, resources, sessions, sourceSyllabuses] = await Promise.all([
    prisma.syllabus.findUnique({
      where: { code: "SYLLABUS-7" },
      include: {
        sections: { orderBy: { sortOrder: "asc" } },
        courseDays: { include: { lessons: true }, orderBy: { courseDayNumber: "asc" } },
      },
    }),
    prisma.lessonResource.findMany({
      where: { lessonId: { in: legacyLessons.map((lesson) => lesson.id) } },
      select: { lessonId: true, url: true },
    }),
    prisma.lessonSession.findMany({
      where: { id: { in: backup.data.linkedSessions.map((session) => session.id) } },
      select: { id: true, syllabusLessonId: true },
    }),
    prisma.syllabus.findMany({
      where: { code: { in: Array.from({ length: 7 }, (_, index) => `SYLLABUS-${index + 1}`) } },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: {
            unit: true,
            courseDays: {
              orderBy: { sortOrder: "asc" },
              include: { lessons: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    }),
  ]);

  assert(syllabus7, "SYLLABUS-7 does not exist");
  assert(syllabus7.totalCourseDays === 52, "SYLLABUS-7 totalCourseDays is not 52");
  assert(syllabus7.courseDays.length === 52, "SYLLABUS-7 does not contain exactly 52 course days");
  assert(
    syllabus7.courseDays.every((day, index) => day.courseDayNumber === index + 1),
    "SYLLABUS-7 course-day numbering is not contiguous from 1 to 52",
  );
  assert(
    syllabus7.courseDays.every((day) => day.lessons.length > 0),
    "at least one SYLLABUS-7 course day has no lesson",
  );
  const syllabus7UnitLessons = syllabus7.courseDays.flatMap((day) => day.lessons).filter((lesson) => lesson.unitId);
  assert(syllabus7UnitLessons.length === 72, "SYLLABUS-7 does not contain exactly 72 unit lessons");
  assert(
    syllabus7UnitLessons.some((lesson) => lesson.pupilBookPage && lesson.activityBookPage),
    "SYLLABUS-7 detailed PB/AB page data was not imported",
  );
  assert(
    syllabus7.sections.length === expectedSyllabus7Sections.length,
    "SYLLABUS-7 section count differs from the approved sequence",
  );
  for (const [index, expected] of expectedSyllabus7Sections.entries()) {
    const actual = syllabus7.sections[index];
    assert(
      actual.type === expected[0] &&
        actual.courseDayStart === expected[1] &&
        actual.courseDayEnd === expected[2],
      `SYLLABUS-7 section ${index + 1} has the wrong type or course-day range`,
    );
  }

  const resourceKeys = new Set(resources.map((resource) => `${resource.lessonId}\u0000${resource.url}`));
  const missingUrls = legacyUrls.filter((key) => !resourceKeys.has(key));
  assert(missingUrls.length === 0, `${missingUrls.length} legacy resource URLs were not migrated`);
  assert(resources.length >= backup.data.totals.materialLinks, "migrated resource count is below backup count");

  const expectedSessions = new Map(
    backup.data.linkedSessions.map((session) => [session.id, session.syllabusLessonId]),
  );
  assert(sessions.length === backup.data.totals.linkedSessions, "one or more legacy sessions disappeared");
  assert(
    sessions.every((session) => expectedSessions.get(session.id) === session.syllabusLessonId),
    "a legacy session changed its syllabus lesson reference",
  );

  assert(sourceSyllabuses.length === 7, "not all seven source syllabuses were imported");
  for (const syllabus of sourceSyllabuses) {
    const days = syllabus.sections.flatMap((section) => section.courseDays);
    const units = syllabus.sections.filter((section) => section.type === "UNIT");
    const code = syllabus.code;
    assert(code && code in expectedCourseDays, "source syllabus has no recognized code");
    assert(units.length === 9, `${syllabus.code} does not contain exactly 9 units`);
    assert(
      days.length === expectedCourseDays[code],
      `${syllabus.code} has ${days.length} course days instead of ${expectedCourseDays[code]}`,
    );
    const dayNumbers = days.map((day) => day.courseDayNumber);
    assert(new Set(dayNumbers).size === dayNumbers.length, `${syllabus.code} contains duplicate course-day numbers`);
    assert(
      days.every((day) => day.syllabusId === syllabus.id),
      `${syllabus.code} contains a course day linked to another syllabus`,
    );
    for (const section of syllabus.sections) {
      assert(section.syllabusId === syllabus.id, `${syllabus.code} contains a section linked to another syllabus`);
      if (section.type === "UNIT") assert(section.unit, `${syllabus.code} has a UNIT section without a unit record`);
      if (section.unit) {
        assert(section.unit.sectionId === section.id, `${syllabus.code} has a unit linked to the wrong section`);
        assert(section.unit.syllabusId === syllabus.id, `${syllabus.code} has a unit linked to another syllabus`);
        assert(
          Boolean(section.unit.overview) && Array.isArray(section.unit.learningObjectives) && section.unit.learningObjectives.length > 0,
          `${syllabus.code} has a unit without imported source content`,
        );
      }
      assert(
        section.courseDays.every((day) => day.sectionId === section.id),
        `${syllabus.code} contains a course day linked to the wrong section`,
      );
      for (const day of section.courseDays) {
        assert(day.lessons.length > 0, `${syllabus.code} course day ${day.courseDayNumber} has no lesson`);
        const lessonOrders = day.lessons.map((lesson) => lesson.order);
        assert(
          day.lessons.every((lesson) => lesson.courseDayId === day.id) &&
            new Set(lessonOrders).size === lessonOrders.length &&
            lessonOrders.every((order, index) => index === 0 || order > lessonOrders[index - 1]),
          `${syllabus.code} course day ${day.courseDayNumber} has invalid lesson ownership or ordering`,
        );
      }
    }
  }
  for (const syllabus of sourceSyllabuses.filter((item) => item.code !== "SYLLABUS-7")) {
    const metadata = syllabus.metadata as { sourceStatus?: string } | null;
    assert(
      metadata?.sourceStatus === (syllabus.code === "SYLLABUS-6" ? "UNIT_DATA_VERIFIED_COURSE_DAYS_UNSPECIFIED" : "VERIFIED"),
      `${syllabus.code} has an incorrect source-verification marker`,
    );
  }

  console.log(
    JSON.stringify(
      {
        backup: backup.file,
        verified: {
          sourceSyllabuses: sourceSyllabuses.length,
          sourceCourseDays: sourceSyllabuses.reduce((sum, syllabus) => sum + syllabus.sections.reduce((sectionSum, section) => sectionSum + section.courseDays.length, 0), 0),
          syllabus7CourseDays: syllabus7.courseDays.length,
          syllabus7Sections: syllabus7.sections.length,
          migratedLegacyResources: resources.length,
          preservedLegacySessions: sessions.length,
          missingLegacyResourceUrls: missingUrls.length,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
