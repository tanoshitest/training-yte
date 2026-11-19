import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { syllabusSources } from "../src/data/syllabuses";
import { seedSyllabus6Curriculum } from "./import-syllabus-6";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type DatasetSection = {
  type: "UNIT" | "PROJECT" | "REVIEW" | "MIDTERM_TEST" | "FINAL_TEST";
  title: string;
  unitNumber?: number;
  body: string;
};

const unitDayTemplates: Record<number, string[]> = {
  1: [
    "Vocabulary 1",
    "Story + Language Practice 1",
    "Vocabulary 2 & Song + Language Practice 2",
    "Cross-curricular / Literature",
    "Pre A1 Starters & Extra Practice / Mission in action",
    "Unit Test + Speaking Practice",
  ],
  2: [
    "Vocabulary",
    "Story + Language Practice 1",
    "Vocabulary 2 & Song + Language Practice 2",
    "Cross-curricular / Literature",
    "A1 Movers & Extra Practice / Mission in action",
    "Unit Test + Speaking Practice",
  ],
  3: [
    "Vocabulary 1",
    "Story + Language Practice 1",
    "Vocabulary 2 & Song + Language Practice 2",
    "Cross-curricular / Literature",
    "Pre A1 Starters & Extra Practice / Mission in action",
    "Unit Test + Speaking Practice",
  ],
  4: ["Lessons 1-2", "Lessons 3-4", "Lessons 5-6", "Progress Test + Speaking Practice"],
  5: [
    "Vocabulary 1",
    "Story / Language Practice 1",
    "Vocabulary 2 & Song / Language Practice 2",
    "Grammar Practice",
    "Cross-curricular / Literature",
    "A2 Flyers & Extra Practice / Mission in action",
    "Unit Test + Speaking Practice",
  ],
  6: [
    "Vocabulary 1",
    "Story / Language Practice 1",
    "Vocabulary 2 & Song / Language Practice 2",
    "Grammar Practice",
    "Cross-curricular / Literature",
    "A2 Flyers & Extra Practice / Mission in action",
    "Unit Test + Speaking Practice",
  ],
};

function cleanMarkdown(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function field(body: string, label: string) {
  const match = body.match(new RegExp(`\\*\\*${label}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[A-Za-z/]+:?\\*\\*|$)`, "i"));
  return match ? cleanMarkdown(match[1]) : undefined;
}

function sectionType(title: string): DatasetSection["type"] {
  if (/^Project/i.test(title)) return "PROJECT";
  if (/Final/i.test(title)) return "FINAL_TEST";
  if (/Mid-test|Mid-term/i.test(title)) return "MIDTERM_TEST";
  return "REVIEW";
}

async function loadDataset() {
  const file = path.join(process.cwd(), "SYLLABUS_1_7_DATA.md");
  const markdown = await readFile(file, "utf8");
  const result = new Map<number, DatasetSection[]>();

  for (let syllabusNumber = 1; syllabusNumber <= 7; syllabusNumber += 1) {
    const startMarker = `# ${syllabusNumber}. SYLLABUS ${syllabusNumber}`;
    const start = markdown.indexOf(startMarker);
    if (start < 0) throw new Error(`Dataset is missing ${startMarker}`);
    const next = syllabusNumber < 7 ? markdown.indexOf(`# ${syllabusNumber + 1}. SYLLABUS`, start + startMarker.length) : markdown.indexOf("# 8. DATA MODEL", start);
    const block = markdown.slice(start, next < 0 ? markdown.length : next);
    const headings = [...block.matchAll(/^###\s+(.+)$/gm)];
    const sections: DatasetSection[] = [];
    for (const [index, heading] of headings.entries()) {
      const rawTitle = heading[1].trim();
      if (/^(Day|Lesson|Course Day|Course Days|Objectives?|Unit objectives)/i.test(rawTitle)) continue;
      const bodyStart = heading.index! + heading[0].length;
      const bodyEnd = headings[index + 1]?.index ?? block.length;
      const unit = rawTitle.match(/^Unit\s+(\d+)\s+---\s+(.+)$/i);
      sections.push({
        type: unit ? "UNIT" : sectionType(rawTitle),
        title: unit ? unit[2].replace(/\s+---\s+Course Days?.*$/i, "").trim() : rawTitle,
        unitNumber: unit ? Number(unit[1]) : undefined,
        body: block.slice(bodyStart, bodyEnd).trim(),
      });
    }
    result.set(syllabusNumber, sections);
  }
  return result;
}

async function loadDatasetMarkdown() {
  return readFile(path.join(process.cwd(), "SYLLABUS_1_7_DATA.md"), "utf8");
}

type Syllabus7LessonData = {
  unitNumber: number;
  lessonNumber: number;
  title: string;
  body: string;
  pupilBookPage?: string;
  activityBookPage?: string;
};

function syllabus7Details(markdown: string) {
  const start = markdown.indexOf("# 7. SYLLABUS 7");
  if (start < 0) throw new Error("Dataset is missing Syllabus 7");
  const block = markdown.slice(start, markdown.indexOf("# 8. DATA MODEL", start));
  const unitHeadings = [...block.matchAll(/^## Unit\s+(\d+)\s+---\s+(.+?)\s+---\s+Course Days\s+(\d+)--(\d+)$/gm)];
  const units: Array<{ unitNumber: number; title: string; objectives: string; lessons: Syllabus7LessonData[] }> = [];

  for (const [unitIndex, heading] of unitHeadings.entries()) {
    const unitNumber = Number(heading[1]);
    const unitStart = heading.index! + heading[0].length;
    const unitEnd = unitHeadings[unitIndex + 1]?.index ?? block.length;
    const unitBlock = block.slice(unitStart, unitEnd);
    const objectivesMatch = unitBlock.match(/^### (?:Unit objectives|Objectives)\s*\n([\s\S]*?)(?=^###\s+)/m);
    const objectives = cleanMarkdown(objectivesMatch?.[1] ?? "");
    const lessonHeadings = [...unitBlock.matchAll(/^### (?:Day\s+\d+\s*\/\s*)?Lesson\s+(\d+)(?:\s+---\s+(.+))?$/gm)];
    const lessons: Syllabus7LessonData[] = [];

    for (const [lessonIndex, lessonHeading] of lessonHeadings.entries()) {
      const lessonStart = lessonHeading.index! + lessonHeading[0].length;
      const lessonEnd = lessonHeadings[lessonIndex + 1]?.index ?? unitBlock.length;
      const title = lessonHeading[2]?.trim() || `Lesson ${lessonHeading[1]}`;
      const pagePair = title.match(/PB\/AB\s+([\d-]+)/i);
      const pupilBook = title.match(/PB\s+([\d-]+)/i);
      const activityBook = title.match(/AB\s+([\d-]+)/i);
      lessons.push({
        unitNumber,
        lessonNumber: Number(lessonHeading[1]),
        title,
        body: unitBlock.slice(lessonStart, lessonEnd).trim(),
        pupilBookPage: pagePair?.[1] ?? pupilBook?.[1],
        activityBookPage: pagePair?.[1] ?? activityBook?.[1],
      });
    }
    units.push({ unitNumber, title: heading[2].trim(), objectives, lessons });
  }
  return units;
}

function lessonField(body: string, label: string) {
  const match = body.match(new RegExp(`(?:\\*\\*)?${label}:?(?:\\*\\*)?\\s*([\\s\\S]*?)(?=(?:\\*\\*)?(?:Skills|Tasks|Vocabulary|Language|Outcome):|$)`, "i"));
  return cleanMarkdown(match?.[1] ?? "") || undefined;
}

function lessonSkills(body: string) {
  const skills = lessonField(body, "Skills")?.toLowerCase() ?? "";
  const has = (short: string, full: string) => new RegExp(`(?:^|[,/\\s])${short}(?:$|[,./\\s])|${full}`, "i").test(skills);
  return {
    hasListening: has("l", "listening"),
    hasSpeaking: has("s", "speaking"),
    hasReading: has("r", "reading"),
    hasWriting: has("w", "writing"),
  };
}

type LegacyMaterial = { title?: unknown; url?: unknown };

function materials(value: unknown): Array<{ title: string; url: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as LegacyMaterial;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) return [];
    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : url;
    return [{ title, url }];
  });
}

async function migrateLegacyCurriculum() {
  const syllabuses = await prisma.syllabus.findMany({
    where: { sections: { none: {} }, units: { some: {} } },
    include: { units: { include: { lessons: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } } },
  });

  for (const syllabus of syllabuses) {
    await prisma.$transaction(async (tx) => {
      let courseDayNumber = 0;
      for (const [unitIndex, unit] of syllabus.units.entries()) {
        const start = courseDayNumber + 1;
        const section = await tx.curriculumSection.create({
          data: {
            syllabusId: syllabus.id,
            type: "UNIT",
            title: unit.name,
            courseDayStart: start,
            courseDayEnd: start + unit.lessons.length - 1,
            sortOrder: unitIndex + 1,
            metadata: { migratedFromLegacy: true },
          },
        });
        await tx.syllabusUnit.update({
          where: { id: unit.id },
          data: { sectionId: section.id, unitNumber: unitIndex + 1 },
        });

        for (const [lessonIndex, lesson] of unit.lessons.entries()) {
          courseDayNumber += 1;
          const day = await tx.courseDay.create({
            data: {
              syllabusId: syllabus.id,
              sectionId: section.id,
              unitId: unit.id,
              courseDayNumber,
              unitDayNumber: lessonIndex + 1,
              title: lesson.name,
              sortOrder: courseDayNumber,
            },
          });
          await tx.syllabusLesson.update({
            where: { id: lesson.id },
            data: {
              courseDayId: day.id,
              lessonNumber: lessonIndex + 1,
              lessonType: "OTHER",
            },
          });
          for (const [resourceIndex, resource] of materials(lesson.materials).entries()) {
            await tx.lessonResource.upsert({
              where: { lessonId_url: { lessonId: lesson.id, url: resource.url } },
              create: {
                syllabusId: syllabus.id,
                sectionId: section.id,
                unitId: unit.id,
                courseDayId: day.id,
                lessonId: lesson.id,
                resourceType: "EXTERNAL_LINK",
                title: resource.title,
                url: resource.url,
                sortOrder: resourceIndex + 1,
                metadata: { migratedFromMaterials: true },
              },
              update: {},
            });
          }
        }
      }
      await tx.syllabus.update({
        where: { id: syllabus.id },
        data: {
          totalCourseDays: courseDayNumber,
          metadata: { migratedFromLegacy: true, legacyMaterialsPreserved: true },
        },
      });
    });
    console.log(`Migrated legacy curriculum: ${syllabus.name}`);
  }
}

async function seedPartialSources() {
  for (const [sourceIndex, source] of syllabusSources.entries()) {
    const syllabus = await prisma.syllabus.upsert({
      where: { code: source.code },
      create: {
        code: source.code,
        name: source.name,
        totalCourseDays: source.totalCourseDays ?? 0,
        sortOrder: sourceIndex + 1,
        status: "DRAFT",
        metadata: {
          sourceVerified: source.sourceVerified,
          sourceStatus: source.sourceVerified ? "VERIFIED" : "NEEDS_SOURCE_VERIFICATION",
        },
      },
      update: {},
      include: { _count: { select: { sections: true } } },
    });
    if (
      syllabus._count.sections > 0 ||
      source.code === "SYLLABUS-7" ||
      source.units.length === 0
    ) continue;

    await prisma.$transaction(async (tx) => {
      for (const [unitIndex, sourceUnit] of source.units.entries()) {
        const section = await tx.curriculumSection.create({
          data: {
            syllabusId: syllabus.id,
            type: "UNIT",
            title: sourceUnit.title,
            sortOrder: unitIndex + 1,
            metadata: { sourceStatus: "NEEDS_SOURCE_VERIFICATION" },
          },
        });
        await tx.syllabusUnit.create({
          data: {
            syllabusId: syllabus.id,
            sectionId: section.id,
            unitNumber: sourceUnit.unitNumber,
            name: sourceUnit.title,
            order: unitIndex + 1,
          },
        });
      }
    });
    console.log(`Imported confirmed unit titles: ${source.name}`);
  }
}

async function seedDatasetCurriculum(dataset: Map<number, DatasetSection[]>) {
  for (let syllabusNumber = 1; syllabusNumber <= 6; syllabusNumber += 1) {
    const code = `SYLLABUS-${syllabusNumber}`;
    const sourceSections = dataset.get(syllabusNumber) ?? [];
    const syllabus = await prisma.syllabus.findUnique({
      where: { code },
      include: {
        _count: { select: { courseDays: true, resources: true } },
      },
    });
    if (!syllabus) throw new Error(`${code} was not created before dataset import`);

    // The previous importer created title-only shells. They are safe to replace,
    // but a curriculum that already has days or resources must only be preserved.
    if (syllabus._count.courseDays > 0 || syllabus._count.resources > 0) {
      console.warn(
        `Preserved existing detailed curriculum for ${code}; dataset shell replacement was skipped.`,
      );
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.syllabusUnit.deleteMany({ where: { syllabusId: syllabus.id } });
      await tx.curriculumSection.deleteMany({ where: { syllabusId: syllabus.id } });

      let courseDayNumber = 0;
      for (const [sectionIndex, source] of sourceSections.entries()) {
        const dayTemplate = source.type === "UNIT" ? unitDayTemplates[syllabusNumber] : undefined;
        const start = dayTemplate ? courseDayNumber + 1 : null;
        const section = await tx.curriculumSection.create({
          data: {
            syllabusId: syllabus.id,
            type: source.type,
            title: source.type === "UNIT" ? `Unit ${source.unitNumber} — ${source.title}` : source.title,
            courseDayStart: start,
            courseDayEnd: dayTemplate ? courseDayNumber + dayTemplate.length : null,
            sortOrder: sectionIndex + 1,
            metadata: {
              source: "SYLLABUS_1_7_DATA.md",
              sourceVerified: true,
              courseDayStatus: dayTemplate ? "DECLARED_PATTERN" : "NOT_SPECIFIED_IN_SOURCE",
            },
          },
        });

        if (source.type !== "UNIT") continue;
        const objectives = field(source.body, "After Unit \\d+, students can")
          ?? field(source.body, "Outcomes")
          ?? field(source.body, "Objectives")
          ?? field(source.body, "Focus")
          ?? cleanMarkdown(source.body);
        const vocabulary = field(source.body, "Vocabulary");
        const language = field(source.body, "Language");
        const unit = await tx.syllabusUnit.create({
          data: {
            syllabusId: syllabus.id,
            sectionId: section.id,
            unitNumber: source.unitNumber,
            name: source.title,
            overview: cleanMarkdown(source.body),
            learningObjectives: objectives ? [objectives] : [],
            order: source.unitNumber ?? sectionIndex + 1,
          },
        });

        if (!dayTemplate) continue;
        for (const [dayIndex, dayTitle] of dayTemplate.entries()) {
          courseDayNumber += 1;
          const day = await tx.courseDay.create({
            data: {
              syllabusId: syllabus.id,
              sectionId: section.id,
              unitId: unit.id,
              courseDayNumber,
              unitDayNumber: dayIndex + 1,
              title: dayTitle,
              sortOrder: courseDayNumber,
            },
          });
          const lessonTitles = syllabusNumber === 4
            ? dayTitle.split(" + ").map((title) => title.trim())
            : [dayTitle];
          for (const [lessonIndex, lessonTitle] of lessonTitles.entries()) {
            const lessonNumber = syllabusNumber === 4 ? dayIndex * 2 + lessonIndex + 1 : dayIndex + 1;
            await tx.syllabusLesson.create({
              data: {
                unitId: unit.id,
                courseDayId: day.id,
                lessonNumber,
                lessonType: /Test/i.test(lessonTitle) ? "PROGRESS_TEST" : /Speaking Practice/i.test(lessonTitle) ? "SPEAKING_PRACTICE" : "OTHER",
                name: lessonTitle,
                order: lessonNumber,
                vocabulary: vocabulary ?? null,
                grammar: language ?? null,
                languageTargets: language ? [language] : [],
                lessonOutcomes: objectives ? [objectives] : [],
                tasks: [],
                materials: [],
              },
            });
          }
        }
      }

      await tx.syllabus.update({
        where: { id: syllabus.id },
        data: {
          totalCourseDays: courseDayNumber,
          status: "ACTIVE",
          metadata: {
            source: "SYLLABUS_1_7_DATA.md",
            sourceVerified: true,
            sourceStatus: "VERIFIED",
          },
        },
      });
    });
    console.log(`Imported dataset curriculum: ${code}`);
  }
}

const syllabus7Sequence = [
  { type: "UNIT" as const, title: "Unit 1 — THIS YEAR'S TRIP", days: 4, unit: 1 },
  { type: "UNIT" as const, title: "Unit 2 — OUR BEAUTIFUL PLANET", days: 4, unit: 2 },
  { type: "PROJECT" as const, title: "Project 1", days: 1 },
  { type: "UNIT" as const, title: "Unit 3 — LET'S CELEBRATE!", days: 4, unit: 3 },
  { type: "REVIEW" as const, title: "Review 1", days: 2 },
  { type: "UNIT" as const, title: "Unit 4 — FUN IN THE JUNGLE", days: 4, unit: 4 },
  { type: "PROJECT" as const, title: "Project 2", days: 1 },
  { type: "REVIEW" as const, title: "Review 2", days: 2 },
  { type: "MIDTERM_TEST" as const, title: "Mid-term Test", days: 2 },
  { type: "UNIT" as const, title: "Unit 5 — LET IT SNOW", days: 4, unit: 5 },
  { type: "UNIT" as const, title: "Unit 6 — WORKING TOGETHER", days: 4, unit: 6 },
  { type: "PROJECT" as const, title: "Project 3", days: 1 },
  { type: "REVIEW" as const, title: "Review 3", days: 2 },
  { type: "UNIT" as const, title: "Unit 7 — THEN AND NOW", days: 4, unit: 7 },
  { type: "UNIT" as const, title: "Unit 8 — SPACE TRAVEL", days: 4, unit: 8 },
  { type: "PROJECT" as const, title: "Project 4", days: 1 },
  { type: "UNIT" as const, title: "Unit 9 — GREAT BAKERS", days: 4, unit: 9 },
  { type: "REVIEW" as const, title: "Review 4", days: 2 },
  { type: "FINAL_TEST" as const, title: "Final Test", days: 2 },
];

async function seedSyllabus7() {
  const syllabus = await prisma.syllabus.findUnique({
    where: { code: "SYLLABUS-7" },
    include: { _count: { select: { sections: true } } },
  });
  if (!syllabus || syllabus._count.sections > 0) return;

  await prisma.$transaction(async (tx) => {
    let courseDayNumber = 0;
    for (const [sectionIndex, source] of syllabus7Sequence.entries()) {
      const start = courseDayNumber + 1;
      const section = await tx.curriculumSection.create({
        data: {
          syllabusId: syllabus.id,
          type: source.type,
          title: source.title,
          courseDayStart: start,
          courseDayEnd: start + source.days - 1,
          sortOrder: sectionIndex + 1,
          metadata: { sourceStatus: "VERIFIED" },
        },
      });
      const unit = source.type === "UNIT"
        ? await tx.syllabusUnit.create({
            data: {
              syllabusId: syllabus.id,
              sectionId: section.id,
              unitNumber: source.unit,
              name: source.title.replace(/^Unit \d+ — /, ""),
              order: source.unit!,
            },
          })
        : null;

      for (let dayIndex = 0; dayIndex < source.days; dayIndex += 1) {
        courseDayNumber += 1;
        const day = await tx.courseDay.create({
          data: {
            syllabusId: syllabus.id,
            sectionId: section.id,
            unitId: unit?.id,
            courseDayNumber,
            unitDayNumber: unit ? dayIndex + 1 : null,
            title: unit ? `Day ${dayIndex + 1}` : source.title,
            sortOrder: courseDayNumber,
          },
        });
        if (unit) {
          const lessonOffset = dayIndex * 2;
          const special = dayIndex === 2
            ? ["Lesson 5", "Lesson 6 — Flyers Practice + Review Unit"]
            : dayIndex === 3
              ? ["Lesson 7 — Progress Test / Unit Test", "Lesson 8 — Speaking Practice"]
              : [`Lesson ${lessonOffset + 1}`, `Lesson ${lessonOffset + 2}`];
          for (const [lessonIndex, title] of special.entries()) {
            const lessonNumber = lessonOffset + lessonIndex + 1;
            await tx.syllabusLesson.create({
              data: {
                unitId: unit.id,
                courseDayId: day.id,
                lessonNumber,
                lessonType: lessonNumber === 6 ? "FLYERS_PRACTICE" : lessonNumber === 7 ? "PROGRESS_TEST" : lessonNumber === 8 ? "SPEAKING_PRACTICE" : "OTHER",
                name: title,
                order: lessonNumber,
              },
            });
          }
        } else {
          await tx.syllabusLesson.create({
            data: {
              courseDayId: day.id,
              lessonType: source.type,
              name: source.days > 1 ? `${source.title} — Day ${dayIndex + 1}` : source.title,
              order: 1,
            },
          });
        }
      }
    }
    await tx.syllabus.update({ where: { id: syllabus.id }, data: { totalCourseDays: courseDayNumber } });
  });
  console.log("Imported verified Syllabus 7 curriculum (52 course days).");
}

async function enrichSyllabus7(markdown: string) {
  const details = syllabus7Details(markdown);
  const syllabus = await prisma.syllabus.findUnique({
    where: { code: "SYLLABUS-7" },
    include: { units: { include: { lessons: true } } },
  });
  if (!syllabus) throw new Error("SYLLABUS-7 is missing after import");

  await prisma.$transaction(async (tx) => {
    for (const sourceUnit of details) {
      const unit = syllabus.units.find((item) => item.unitNumber === sourceUnit.unitNumber);
      if (!unit) throw new Error(`SYLLABUS-7 Unit ${sourceUnit.unitNumber} is missing`);
      await tx.syllabusUnit.update({
        where: { id: unit.id },
        data: {
          name: sourceUnit.title,
          overview: sourceUnit.objectives,
          learningObjectives: sourceUnit.objectives ? [sourceUnit.objectives] : [],
        },
      });
      for (const sourceLesson of sourceUnit.lessons) {
        const lesson = unit.lessons.find((item) => item.lessonNumber === sourceLesson.lessonNumber);
        if (!lesson) throw new Error(`SYLLABUS-7 Unit ${sourceUnit.unitNumber} Lesson ${sourceLesson.lessonNumber} is missing`);
        const tasks = lessonField(sourceLesson.body, "Tasks");
        const language = lessonField(sourceLesson.body, "Language");
        const outcome = lessonField(sourceLesson.body, "Outcome");
        await tx.syllabusLesson.update({
          where: { id: lesson.id },
          data: {
            name: sourceLesson.title === `Lesson ${sourceLesson.lessonNumber}`
              ? cleanMarkdown(sourceLesson.body) || sourceLesson.title
              : sourceLesson.title,
            pupilBookPage: sourceLesson.pupilBookPage ?? null,
            activityBookPage: sourceLesson.activityBookPage ?? null,
            vocabulary: lessonField(sourceLesson.body, "Vocabulary") ?? null,
            grammar: language ?? null,
            languageTargets: language ? [language] : [],
            lessonOutcomes: outcome ? [outcome] : [],
            tasks: tasks ? tasks.split(";").map((item) => item.trim()).filter(Boolean) : [],
            ...lessonSkills(sourceLesson.body),
          },
        });
      }
    }
    await tx.syllabus.update({
      where: { id: syllabus.id },
      data: {
        status: "ACTIVE",
        metadata: { source: "SYLLABUS_1_7_DATA.md", sourceVerified: true, sourceStatus: "VERIFIED" },
      },
    });
  });
  console.log(`Enriched SYLLABUS-7 with ${details.reduce((sum, unit) => sum + unit.lessons.length, 0)} detailed lessons.`);
}

async function main() {
  const markdown = await loadDatasetMarkdown();
  const dataset = await loadDataset();
  await migrateLegacyCurriculum();
  await seedPartialSources();
  await seedDatasetCurriculum(dataset);
  await seedSyllabus6Curriculum(prisma);
  await seedSyllabus7();
  await enrichSyllabus7(markdown);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
