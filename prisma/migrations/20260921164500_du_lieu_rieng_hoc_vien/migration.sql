-- CreateTable
CREATE TABLE "student_progress" (
    "studentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL,

    CONSTRAINT "student_progress_pkey" PRIMARY KEY ("studentId","itemId")
);

-- CreateTable
CREATE TABLE "student_activity_attempts" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "syllabusId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "answers" JSONB NOT NULL,
    "completedAt" TEXT NOT NULL,

    CONSTRAINT "student_activity_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_app_state" (
    "studentId" TEXT NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "student_app_state_pkey" PRIMARY KEY ("studentId")
);

-- CreateIndex
CREATE INDEX "student_activity_attempts_studentId_position_idx" ON "student_activity_attempts"("studentId", "position");
