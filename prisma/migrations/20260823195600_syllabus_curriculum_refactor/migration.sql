-- CreateEnum
CREATE TYPE "CurriculumSectionType" AS ENUM ('UNIT', 'REVIEW', 'PROJECT', 'MIDTERM_TEST', 'FINAL_TEST', 'OTHER');

-- CreateEnum
CREATE TYPE "LessonResourceType" AS ENUM ('LESSON_PLAN', 'VIDEO', 'AUDIO', 'WORKSHEET', 'PDF', 'SLIDE', 'GAME', 'QUIZ', 'HOMEWORK', 'TEACHER_RESOURCE', 'STUDENT_RESOURCE', 'EXTERNAL_LINK', 'OTHER');

-- AlterTable
ALTER TABLE "syllabus_lessons" ADD COLUMN     "activityBookPage" TEXT,
ADD COLUMN     "courseDayId" TEXT,
ADD COLUMN     "hasListening" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasReading" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasSpeaking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasWriting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languageTargets" JSONB,
ADD COLUMN     "lessonNumber" INTEGER,
ADD COLUMN     "lessonOutcomes" JSONB,
ADD COLUMN     "lessonType" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "pupilBookPage" TEXT,
ADD COLUMN     "tasks" JSONB,
ALTER COLUMN "stageId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "syllabus_stages" ADD COLUMN     "learningObjectives" JSONB,
ADD COLUMN     "overview" TEXT,
ADD COLUMN     "sectionId" TEXT,
ADD COLUMN     "topic" TEXT,
ADD COLUMN     "unitNumber" INTEGER;

-- AlterTable
ALTER TABLE "syllabuses" ADD COLUMN     "levelLabel" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCourseDays" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "curriculum_sections" (
    "id" TEXT NOT NULL,
    "syllabusId" TEXT NOT NULL,
    "type" "CurriculumSectionType" NOT NULL,
    "title" TEXT NOT NULL,
    "courseDayStart" INTEGER,
    "courseDayEnd" INTEGER,
    "sortOrder" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_days" (
    "id" TEXT NOT NULL,
    "syllabusId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "unitId" TEXT,
    "courseDayNumber" INTEGER NOT NULL,
    "unitDayNumber" INTEGER,
    "title" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_resources" (
    "id" TEXT NOT NULL,
    "syllabusId" TEXT NOT NULL,
    "sectionId" TEXT,
    "unitId" TEXT,
    "courseDayId" TEXT,
    "lessonId" TEXT,
    "resourceType" "LessonResourceType" NOT NULL DEFAULT 'EXTERNAL_LINK',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "openInNewTab" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curriculum_sections_syllabusId_type_idx" ON "curriculum_sections"("syllabusId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_sections_syllabusId_sortOrder_key" ON "curriculum_sections"("syllabusId", "sortOrder");

-- CreateIndex
CREATE INDEX "course_days_sectionId_sortOrder_idx" ON "course_days"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "course_days_unitId_unitDayNumber_idx" ON "course_days"("unitId", "unitDayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "course_days_syllabusId_courseDayNumber_key" ON "course_days"("syllabusId", "courseDayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "course_days_syllabusId_sortOrder_key" ON "course_days"("syllabusId", "sortOrder");

-- CreateIndex
CREATE INDEX "lesson_resources_syllabusId_sortOrder_idx" ON "lesson_resources"("syllabusId", "sortOrder");

-- CreateIndex
CREATE INDEX "lesson_resources_sectionId_sortOrder_idx" ON "lesson_resources"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "lesson_resources_unitId_sortOrder_idx" ON "lesson_resources"("unitId", "sortOrder");

-- CreateIndex
CREATE INDEX "lesson_resources_courseDayId_sortOrder_idx" ON "lesson_resources"("courseDayId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_resources_lessonId_url_key" ON "lesson_resources"("lessonId", "url");

-- CreateIndex
CREATE INDEX "syllabus_lessons_courseDayId_idx" ON "syllabus_lessons"("courseDayId");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_lessons_courseDayId_order_key" ON "syllabus_lessons"("courseDayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_stages_sectionId_key" ON "syllabus_stages"("sectionId");

-- AddForeignKey
ALTER TABLE "syllabus_stages" ADD CONSTRAINT "syllabus_stages_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "curriculum_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_lessons" ADD CONSTRAINT "syllabus_lessons_courseDayId_fkey" FOREIGN KEY ("courseDayId") REFERENCES "course_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_sections" ADD CONSTRAINT "curriculum_sections_syllabusId_fkey" FOREIGN KEY ("syllabusId") REFERENCES "syllabuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_days" ADD CONSTRAINT "course_days_syllabusId_fkey" FOREIGN KEY ("syllabusId") REFERENCES "syllabuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_days" ADD CONSTRAINT "course_days_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "curriculum_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_days" ADD CONSTRAINT "course_days_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "syllabus_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_syllabusId_fkey" FOREIGN KEY ("syllabusId") REFERENCES "syllabuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "curriculum_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "syllabus_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_courseDayId_fkey" FOREIGN KEY ("courseDayId") REFERENCES "course_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "syllabus_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
