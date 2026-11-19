import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
const shouldBackup = process.argv.includes("--backup");

const syllabuses = await prisma.syllabus.findMany({
  include: {
    units: { include: { lessons: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
    classes: true,
    _count: { select: { classes: true } },
  },
  orderBy: [{ code: "asc" }, { name: "asc" }],
});

const lessonIds = syllabuses.flatMap((syllabus) =>
  syllabus.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.id)),
);
const sessions = await prisma.lessonSession.findMany({
  where: { syllabusLessonId: { in: lessonIds } },
  select: { id: true, classId: true, sequence: true, syllabusLessonId: true },
});

let materialLessons = 0;
let materialLinks = 0;
const summary = syllabuses.map((syllabus) => {
  let lessons = 0;
  let materials = 0;
  for (const unit of syllabus.units) {
    lessons += unit.lessons.length;
    for (const lesson of unit.lessons) {
      if (!Array.isArray(lesson.materials)) continue;
      materialLessons += 1;
      materials += lesson.materials.length;
      materialLinks += lesson.materials.length;
    }
  }
  return {
    code: syllabus.code,
    name: syllabus.name,
    units: syllabus.units.length,
    lessons,
    materials,
    classes: syllabus._count.classes,
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    syllabuses: syllabuses.length,
    units: syllabuses.reduce((sum, syllabus) => sum + syllabus.units.length, 0),
    lessons: lessonIds.length,
    materialLessons,
    materialLinks,
    linkedSessions: sessions.length,
  },
  summary,
};

console.log(JSON.stringify(report, null, 2));

if (shouldBackup) {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const directory = path.join(process.cwd(), "backups");
  const file = path.join(directory, `syllabus-pre-refactor-${stamp}.json`);
  await mkdir(directory, { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ ...report, syllabuses, linkedSessions: sessions }, null, 2),
    "utf8",
  );
  console.error(`Backup written to ${file}`);
}

}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
