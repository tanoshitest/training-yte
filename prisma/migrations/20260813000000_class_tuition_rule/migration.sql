-- Lớp học có sẵn "rule học phí": thêm học viên vào lớp là áp luôn gói của lớp,
-- không phải chọn tay từng người nữa (R2 — loại lớp quyết định mô hình học phí).
--
--   Lớp thường → classes.packageId     → normal_packages
--   Lớp IELTS  → classes.ieltsCourseId → ielts_courses
--
-- Migration chỉ CỘNG THÊM cột nullable + khoá ngoại (docs/DEPLOY.md §9), lớp cũ
-- giữ nguyên và chỉ cần chọn gói khi muốn thêm học viên.
-- Dùng IF NOT EXISTS vì database production có thể đã dựng bằng `prisma db push`.

ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "packageId" TEXT;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "ieltsCourseId" TEXT;

-- ON DELETE SET NULL: xoá dòng bảng giá / khóa IELTS thì lớp vẫn còn, chỉ mất rule
-- và phải chọn lại — giống cách `student_tuitions` tham chiếu hai bảng này.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_packageId_fkey') THEN
        ALTER TABLE "classes"
            ADD CONSTRAINT "classes_packageId_fkey"
            FOREIGN KEY ("packageId") REFERENCES "normal_packages"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_ieltsCourseId_fkey') THEN
        ALTER TABLE "classes"
            ADD CONSTRAINT "classes_ieltsCourseId_fkey"
            FOREIGN KEY ("ieltsCourseId") REFERENCES "ielts_courses"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
