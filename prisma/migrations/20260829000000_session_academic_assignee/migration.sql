-- Học vụ có thể được phân công trực tiếp cho một buổi kiểm tra.
ALTER TABLE "lesson_sessions" ADD COLUMN "academicStaffId" TEXT;

CREATE INDEX "lesson_sessions_academicStaffId_date_idx"
  ON "lesson_sessions"("academicStaffId", "date");

ALTER TABLE "lesson_sessions"
  ADD CONSTRAINT "lesson_sessions_academicStaffId_fkey"
  FOREIGN KEY ("academicStaffId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
