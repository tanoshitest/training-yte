-- AlterTable
ALTER TABLE "lesson_sessions" ADD COLUMN "hasHomework" BOOLEAN NOT NULL DEFAULT false;

-- Buổi đã đánh giá BTVN trước đây coi như có giao bài.
UPDATE "lesson_sessions"
SET "hasHomework" = true
WHERE id IN (
  SELECT DISTINCT "sessionId" FROM "attendances" WHERE "homeworkRating" IS NOT NULL
);
