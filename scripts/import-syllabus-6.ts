import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  SYLLABUS_6_TOTAL_DAYS,
  syllabus6Curriculum,
} from "../src/data/syllabuses/syllabus-6-curriculum";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function skills(flags: Array<"L" | "S" | "R" | "W"> | undefined) {
  return {
    hasListening: flags?.includes("L") ?? false,
    hasSpeaking: flags?.includes("S") ?? false,
    hasReading: flags?.includes("R") ?? false,
    hasWriting: flags?.includes("W") ?? false,
  };
}

export async function seedSyllabus6Curriculum(client: PrismaClient = prisma) {
  const syllabus = await client.syllabus.findUnique({
    where: { code: "SYLLABUS-6" },
    select: { id: true, _count: { select: { classes: true, courseDays: true } } },
  });
  if (!syllabus) throw new Error("SYLLABUS-6 is missing.");
  if (syllabus._count.classes > 0 && syllabus._count.courseDays > 0) {
    console.warn("SYLLABUS-6 already has course days and is used by a class; skip replace.");
    return syllabus.id;
  }

  await client.$transaction(async (tx) => {
    await tx.syllabusLesson.deleteMany({
      where: { OR: [{ unit: { syllabusId: syllabus.id } }, { courseDay: { syllabusId: syllabus.id } }] },
    });
    await tx.courseDay.deleteMany({ where: { syllabusId: syllabus.id } });
    await tx.syllabusUnit.deleteMany({ where: { syllabusId: syllabus.id } });
    await tx.curriculumSection.deleteMany({ where: { syllabusId: syllabus.id } });

    let courseDayNumber = 0;
    for (const [sectionIndex, source] of syllabus6Curriculum.entries()) {
      const start = courseDayNumber + 1;
      const section = await tx.curriculumSection.create({
        data: {
          syllabusId: syllabus.id,
          type: source.type,
          title: source.type === "UNIT" ? `Unit ${source.unitNumber} — ${source.title}` : source.title,
          courseDayStart: start,
          courseDayEnd: start + source.days.length - 1,
          sortOrder: sectionIndex + 1,
          metadata: { source: "syllabus-6-curriculum.ts", sourceVerified: true },
        },
      });

      const unit =
        source.type === "UNIT"
          ? await tx.syllabusUnit.create({
              data: {
                syllabusId: syllabus.id,
                sectionId: section.id,
                unitNumber: source.unitNumber,
                name: source.title,
                overview: source.objectives?.join(" ") ?? null,
                learningObjectives: source.objectives ?? [],
                order: source.unitNumber ?? sectionIndex + 1,
              },
            })
          : null;

      for (const [dayIndex, day] of source.days.entries()) {
        courseDayNumber += 1;
        const createdDay = await tx.courseDay.create({
          data: {
            syllabusId: syllabus.id,
            sectionId: section.id,
            unitId: unit?.id,
            courseDayNumber,
            unitDayNumber: unit ? dayIndex + 1 : null,
            title: day.title,
            sortOrder: courseDayNumber,
          },
        });
        await tx.syllabusLesson.create({
          data: {
            unitId: unit?.id,
            courseDayId: createdDay.id,
            lessonNumber: unit ? dayIndex + 1 : courseDayNumber,
            lessonType: day.type ?? "OTHER",
            name: day.title,
            order: unit ? dayIndex + 1 : 1,
            pupilBookPage: day.pages ?? null,
            activityBookPage: day.pages ?? null,
            ...skills(day.skills),
            tasks: day.tasks,
            vocabulary: day.vocabulary ?? null,
            grammar: day.language ?? null,
            languageTargets: day.language ? [day.language] : [],
            lessonOutcomes: day.outcomes,
            lessonPlan: day.tasks.join("\n"),
            materials: [],
          },
        });
      }
    }

    await tx.syllabus.update({
      where: { id: syllabus.id },
      data: {
        name: "Syllabus 6",
        totalCourseDays: courseDayNumber,
        status: "ACTIVE",
        metadata: {
          source: "syllabus-6-curriculum.ts",
          sourceVerified: true,
          sourceStatus: "VERIFIED",
        },
      },
    });
  });

  return syllabus.id;
}

async function main() {
  await seedSyllabus6Curriculum();
  console.log(`Imported Syllabus 6 curriculum: ${SYLLABUS_6_TOTAL_DAYS} course days.`);
}

if (process.argv[1]?.replace(/\\/g, "/").includes("import-syllabus-6")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
