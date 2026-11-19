-- Thêm cột học phí gốc cho level con và khóa IELTS.
--
-- Dữ liệu cũ để NULL, còn các form / action sẽ cho phép nhập dần theo nhu cầu.

ALTER TABLE "sub_levels"
  ADD COLUMN "basePrice" DECIMAL(12,2);

ALTER TABLE "ielts_courses"
  ADD COLUMN "basePrice" DECIMAL(12,2);

