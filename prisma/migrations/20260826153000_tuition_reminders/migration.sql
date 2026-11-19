-- Nhắc học phí theo mốc buổi còn lại; phiếu thu ghi ngày gói mới bắt đầu (ngày còn 0 buổi).

ALTER TABLE "tuition_payments" ADD COLUMN IF NOT EXISTS "coverageFrom" DATE;

CREATE TABLE IF NOT EXISTS "tuition_reminders" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "milestone" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "cycleKey" INTEGER NOT NULL,
    "remindedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedById" TEXT NOT NULL,

    CONSTRAINT "tuition_reminders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tuition_reminders_enrollmentId_milestone_cycleKey_key"
    ON "tuition_reminders"("enrollmentId", "milestone", "cycleKey");

CREATE INDEX IF NOT EXISTS "tuition_reminders_studentId_remindedAt_idx"
    ON "tuition_reminders"("studentId", "remindedAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_reminders_enrollmentId_fkey') THEN
        ALTER TABLE "tuition_reminders"
            ADD CONSTRAINT "tuition_reminders_enrollmentId_fkey"
            FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_reminders_studentId_fkey') THEN
        ALTER TABLE "tuition_reminders"
            ADD CONSTRAINT "tuition_reminders_studentId_fkey"
            FOREIGN KEY ("studentId") REFERENCES "students"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_reminders_remindedById_fkey') THEN
        ALTER TABLE "tuition_reminders"
            ADD CONSTRAINT "tuition_reminders_remindedById_fkey"
            FOREIGN KEY ("remindedById") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
