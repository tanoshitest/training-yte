-- Loại lớp quyết định lớp có những trường nào (R2):
--   - Lớp thường: cấp học + level (lộ trình Cấp 1 → Cấp 2, mỗi cấp có Level 1, 2, 3…),
--     không có học phí ở cấp lớp vì gói buổi là của từng học viên.
--   - Lớp IELTS: có khóa học phí (tính trọn khóa), không đi theo lộ trình cấp/level.
--
-- Form đã ẩn các ô không thuộc loại lớp, nhưng dữ liệu cũ vẫn còn giá trị mồ côi
-- (lớp IELTS đang gắn Cấp 1, lớp thường còn gói buổi). Xoá luôn ở đây để bộ lọc
-- "Cấp học" và các báo cáo không đếm nhầm.
--
-- Migration chỉ UPDATE dữ liệu, không DROP COLUMN (docs/DEPLOY.md §9).
UPDATE "classes" SET "levelId" = NULL, "subLevelId" = NULL WHERE "type" = 'IELTS';

UPDATE "classes" SET "packageId" = NULL WHERE "packageId" IS NOT NULL;
