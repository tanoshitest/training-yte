-- Đổi tên nhóm bảng của app Next.js (đang rỗng, app không được deploy) sang tiền tố legacy_
-- để nhường tên sạch cho tầng lưu trữ quan hệ của ứng dụng đang chạy.
-- Dùng RENAME thay vì DROP/CREATE để không mất dữ liệu trong centers và users.

ALTER TABLE "attendances" RENAME TO "legacy_attendances";
ALTER TABLE "audit_logs" RENAME TO "legacy_audit_logs";
ALTER TABLE "branches" RENAME TO "legacy_branches";
ALTER TABLE "centers" RENAME TO "legacy_centers";
ALTER TABLE "class_schedules" RENAME TO "legacy_class_schedules";
ALTER TABLE "class_syllabuses" RENAME TO "legacy_class_syllabuses";
ALTER TABLE "classes" RENAME TO "legacy_classes";
ALTER TABLE "course_days" RENAME TO "legacy_course_days";
ALTER TABLE "curriculum_sections" RENAME TO "legacy_curriculum_sections";
ALTER TABLE "enrollments" RENAME TO "legacy_enrollments";
ALTER TABLE "general_tasks" RENAME TO "legacy_general_tasks";
ALTER TABLE "ielts_courses" RENAME TO "legacy_ielts_courses";
ALTER TABLE "lesson_exercises" RENAME TO "legacy_lesson_exercises";
ALTER TABLE "lesson_periods" RENAME TO "legacy_lesson_periods";
ALTER TABLE "lesson_reports" RENAME TO "legacy_lesson_reports";
ALTER TABLE "lesson_resources" RENAME TO "legacy_lesson_resources";
ALTER TABLE "lesson_sessions" RENAME TO "legacy_lesson_sessions";
ALTER TABLE "levels" RENAME TO "legacy_levels";
ALTER TABLE "normal_packages" RENAME TO "legacy_normal_packages";
ALTER TABLE "recruitment_activities" RENAME TO "legacy_recruitment_activities";
ALTER TABLE "recruitment_cases" RENAME TO "legacy_recruitment_cases";
ALTER TABLE "recruitment_tasks" RENAME TO "legacy_recruitment_tasks";
ALTER TABLE "rooms" RENAME TO "legacy_rooms";
ALTER TABLE "student_advances" RENAME TO "legacy_student_advances";
ALTER TABLE "student_tuitions" RENAME TO "legacy_student_tuitions";
ALTER TABLE "students" RENAME TO "legacy_students";
ALTER TABLE "sub_levels" RENAME TO "legacy_sub_levels";
ALTER TABLE "syllabus_lessons" RENAME TO "legacy_syllabus_lessons";
ALTER TABLE "syllabus_stages" RENAME TO "legacy_syllabus_stages";
ALTER TABLE "syllabuses" RENAME TO "legacy_syllabuses";
ALTER TABLE "teachers" RENAME TO "legacy_teachers";
ALTER TABLE "tuition_entries" RENAME TO "legacy_tuition_entries";
ALTER TABLE "tuition_payments" RENAME TO "legacy_tuition_payments";
ALTER TABLE "tuition_reminders" RENAME TO "legacy_tuition_reminders";
ALTER TABLE "users" RENAME TO "legacy_users";
