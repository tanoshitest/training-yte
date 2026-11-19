-- Một buổi không thể đồng thời giao cho Giáo viên và Học vụ.
ALTER TABLE "lesson_sessions"
  ADD CONSTRAINT "lesson_sessions_single_assignee_check"
  CHECK (NOT ("teacherId" IS NOT NULL AND "academicStaffId" IS NOT NULL));
