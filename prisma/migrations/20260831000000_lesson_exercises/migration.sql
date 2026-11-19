-- CreateTable
CREATE TABLE "lesson_exercises" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_exercises_lessonId_sortOrder_idx" ON "lesson_exercises"("lessonId", "sortOrder");

-- AddForeignKey
ALTER TABLE "lesson_exercises" ADD CONSTRAINT "lesson_exercises_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "syllabus_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
