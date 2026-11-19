-- CreateEnum
CREATE TYPE "LessonRating" AS ENUM ('A_PLUS', 'A', 'A_MINUS', 'B');

-- CreateEnum
CREATE TYPE "HomeworkRating" AS ENUM ('FULL_100', 'EIGHTY_80', 'BELOW_50', 'ZERO_0');

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "homeworkRating" "HomeworkRating",
ADD COLUMN     "lessonRating" "LessonRating",
ADD COLUMN     "pronunciationVideoDone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sub_levels" ALTER COLUMN "updatedAt" DROP DEFAULT;
