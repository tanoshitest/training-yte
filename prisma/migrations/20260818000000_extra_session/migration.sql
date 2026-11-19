-- Buổi thêm của riêng một lớp: lớp cần dạy thêm một buổi ngoài giáo trình thì chèn
-- ngay tại vị trí đang học, bài của Syllabus dồn xuống buổi kế tiếp. Syllabus gốc và
-- các lớp khác không đổi gì.
--
-- Cột đánh dấu để `syncClassSessions` biết lớp cần nhiều hơn số buổi của Syllabus,
-- và để không nhầm buổi thêm với buổi chỉ đơn giản là chưa gán bài.
--
-- Migration chỉ cộng thêm cột có mặc định (docs/DEPLOY.md §9).
ALTER TABLE "lesson_sessions" ADD COLUMN IF NOT EXISTS "isExtra" BOOLEAN NOT NULL DEFAULT false;
